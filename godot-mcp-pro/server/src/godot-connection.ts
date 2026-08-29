import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import {
  JsonRpcRequest,
  JsonRpcResponse,
  PendingRequest,
} from "./utils/types.js";
import {
  GodotConnectionError,
  GodotCommandError,
  TimeoutError,
} from "./utils/errors.js";

const BASE_PORT = 6505;
const MAX_PORT = 6509;
const COMMAND_TIMEOUT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 3;
const TCP_KEEPALIVE_DELAY_MS = 5000;
// The editor rescans the port range every 3s, so a freshly bound server needs
// slightly longer than one scan interval before concluding nobody will dial in.
const REBIND_CLIENT_WAIT_MS = 4000;
// A single bind attempt must always settle; see bindWebSocketServer.
const BIND_TIMEOUT_MS = 3000;

export class GodotConnection {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port: number;
  private fixedPort: boolean;
  private basePort: number;
  private maxPort: number;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongAt: number = 0;
  private connectPromise: Promise<void> | null = null;
  private clientWaitPromise: Promise<void> | null = null;
  private shutDown = false;
  private bindFailure: string | null = null;

  constructor(
    port: number = BASE_PORT,
    fixedPort: boolean = false,
    options: { basePort?: number; maxPort?: number } = {}
  ) {
    this.port = port;
    this.fixedPort = fixedPort;
    this.basePort = options.basePort ?? BASE_PORT;
    this.maxPort = options.maxPort ?? MAX_PORT;
  }

  /**
   * Start WebSocket server, retrying on the next port if the first bind races.
   * Safe to call repeatedly; concurrent calls share one in-flight attempt.
   */
  async connect(): Promise<void> {
    if (this.shutDown) return;
    if (this.wss) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connectOnce().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connectOnce(): Promise<void> {
    if (this.wss) return;

    const candidates = this.fixedPort
      ? [this.port]
      : Array.from({ length: this.maxPort - this.basePort + 1 }, (_, i) => this.basePort + i);

    let lastError: Error | null = null;
    for (const port of candidates) {
      try {
        const wss = await this.bindWebSocketServer(port);
        // disconnect() may have run while this bind was in flight. Assigning
        // this.wss now would resurrect a server nobody can shut down.
        if (this.shutDown) {
          wss.close();
          return;
        }
        this.wss = wss;
        this.port = port;
        this.attachConnectionHandler(wss);
        console.error(
          `[MCP] WebSocket server listening on ws://127.0.0.1:${port}`
        );
        return;
      } catch (err) {
        lastError = err as Error;
        // EADDRINUSE means another MCP server (likely a parallel Claude session)
        // won the bind race. Silently try the next port. Other errors are
        // logged so we don't swallow real config problems.
        if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") {
          console.error(
            `[MCP] Bind failed on port ${port}: ${(err as Error).message}`
          );
        }
      }
    }

    const range = this.fixedPort
      ? String(this.port)
      : `${this.basePort}-${this.maxPort}`;
    // Only blame occupied ports when that is what actually happened; a
    // permission or configuration failure needs a different fix entirely.
    const lastCode = (lastError as NodeJS.ErrnoException | null)?.code;
    let hint: string;
    if (this.fixedPort) {
      hint =
        "Try removing GODOT_MCP_PORT from your client config to enable auto-scanning, or kill the process holding the port.";
    } else if (lastCode === "EADDRINUSE" || lastCode === undefined) {
      hint =
        "All ports are occupied — likely too many parallel Claude Code sessions or stale node MCP processes.";
    } else {
      hint = `The last attempt failed with ${lastCode}, which is not a port collision — check permissions and any local firewall or network configuration.`;
    }
    const message =
      `Failed to bind WebSocket server on port range ${range}. ` +
      `Last error: ${lastError?.message ?? "unknown"}. ${hint}`;
    this.bindFailure = message;
    throw new GodotConnectionError(message);
  }

  /**
   * Called before giving up on a command. If this server never bound a port —
   * every slot was held at startup — retry the bind now, then give the editor
   * a moment to dial in (it rescans every 3s). Without this a single startup
   * bind failure kills the whole session even after the blocking process exits.
   */
  private async ensureConnected(): Promise<void> {
    if (this.isConnected()) return;

    // A recovery started by another command has already bound the port and is
    // waiting for the editor to dial in. Join that wait instead of concluding
    // from a half-finished recovery that the editor is absent.
    if (this.clientWaitPromise) {
      await this.clientWaitPromise;
      return;
    }

    if (this.wss) return; // bound, but no editor attached — nothing to retry

    try {
      await this.connect();
      this.bindFailure = null;
    } catch {
      return; // bindFailure holds the reason; sendCommand reports it
    }

    // Another caller may have started its own wait while this one was inside
    // connect(). Join theirs rather than overwriting it — two pollers would
    // race, and the older finally() would clear the newer promise.
    if (this.clientWaitPromise) {
      await this.clientWaitPromise;
      return;
    }

    const wait = this.waitForClient(REBIND_CLIENT_WAIT_MS).finally(() => {
      if (this.clientWaitPromise === wait) {
        this.clientWaitPromise = null;
      }
    });
    this.clientWaitPromise = wait;
    await wait;
  }

  private waitForClient(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.isConnected()) return resolve();
      const started = Date.now();
      const poll = setInterval(() => {
        if (this.isConnected() || Date.now() - started >= timeoutMs) {
          clearInterval(poll);
          resolve();
        }
      }, 200);
    });
  }

  /** Explains *why* there is no usable connection, without blaming the editor wrongly. */
  private disconnectedReason(): string {
    if (this.wss === null) {
      const range = this.fixedPort
        ? String(this.port)
        : `${this.basePort}-${this.maxPort}`;
      return (
        `This MCP server could not bind a port in ${range} — every port is occupied, ` +
        `most likely by other MCP client sessions (live or stale). The Godot editor itself is probably fine. ` +
        `Close an unused session, or quit stale node processes holding those ports; this server retries the bind on every call.` +
        (this.bindFailure ? ` Details: ${this.bindFailure}` : "")
      );
    }
    return (
      `Godot editor is not connected on port ${this.port}. ` +
      `Make sure the Godot MCP Pro plugin is enabled and the editor is running.`
    );
  }

  /**
   * Try to bind a single WebSocketServer. Resolves once 'listening' fires,
   * rejects on bind error or if neither event arrives.
   *
   * The timeout matters: sendCommand now reaches connect() on every call, so a
   * socket that never fires either event would hang the tool call forever
   * rather than merely failing startup once.
   */
  private bindWebSocketServer(port: number): Promise<WebSocketServer> {
    return new Promise<WebSocketServer>((resolve, reject) => {
      const wss = new WebSocketServer({ port, host: "127.0.0.1" });

      const timer = setTimeout(() => {
        wss.off("listening", onListening);
        wss.off("error", onError);
        wss.close();
        reject(
          new Error(`Bind on port ${port} did not settle within ${BIND_TIMEOUT_MS}ms`)
        );
      }, BIND_TIMEOUT_MS);

      const onError = (err: Error) => {
        clearTimeout(timer);
        wss.off("listening", onListening);
        wss.close();
        reject(err);
      };
      const onListening = () => {
        clearTimeout(timer);
        wss.off("error", onError);
        // Re-attach a runtime error handler now that the server is live.
        // Pre-bind errors fail the connect attempt; post-bind errors are logged.
        wss.on("error", (err: Error) => {
          console.error("[MCP] WebSocket server error:", err.message);
        });
        resolve(wss);
      };

      wss.once("error", onError);
      wss.once("listening", onListening);
    });
  }

  private attachConnectionHandler(wss: WebSocketServer): void {
    wss.on("connection", (ws: WebSocket) => {
      console.error("[MCP] Godot editor connected");

      // Enable OS-level TCP keepalive so half-open sockets surface faster
      // than the Windows default (~2 hours). Application-level heartbeat
      // below is still the primary detection mechanism.
      const sock = (ws as unknown as { _socket?: { setKeepAlive?: (enable: boolean, initialDelay: number) => void } })._socket;
      sock?.setKeepAlive?.(true, TCP_KEEPALIVE_DELAY_MS);

      if (this.client) {
        this.client.close(1000, "Replaced by new connection");
      }
      this.client = ws;
      this.lastPongAt = Date.now();
      this.startHeartbeat();

      ws.on("message", (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      ws.on("close", () => {
        console.error("[MCP] Godot editor disconnected");
        if (this.client === ws) {
          this.client = null;
          this.stopHeartbeat();
          this.rejectAllPending(
            new GodotConnectionError("Godot disconnected")
          );
        }
      });

      ws.on("error", (err: Error) => {
        console.error("[MCP] WebSocket error:", err.message);
      });
    });
  }

  disconnect(): void {
    // Set before tearing anything down: a bind still in flight checks this and
    // closes its socket instead of installing it after shutdown. Without it,
    // sendCommand's lazy re-bind could also start a fresh server post-close.
    this.shutDown = true;
    this.stopHeartbeat();
    if (this.client) {
      this.client.close(1000, "Server shutting down");
      this.client = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.rejectAllPending(new GodotConnectionError("Server shut down"));
  }

  isConnected(): boolean {
    return this.client?.readyState === WebSocket.OPEN;
  }

  getPort(): number {
    return this.port;
  }

  /**
   * `timeoutMs` overrides the default per-command deadline. Needed by commands
   * that legitimately run for minutes — a headless test suite, for instance —
   * which would otherwise be reported as failed while still running.
   */
  async sendCommand(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = COMMAND_TIMEOUT_MS
  ): Promise<unknown> {
    if (!this.isConnected()) {
      await this.ensureConnected();
    }
    if (!this.isConnected()) {
      throw new GodotConnectionError(this.disconnectedReason());
    }

    const id = randomUUID();
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id,
    };

    // Serialize before registering the request, so a payload that cannot be
    // encoded fails immediately instead of leaving a pending entry and a live
    // timer behind to expire as a bogus timeout.
    let payload: string;
    try {
      payload = JSON.stringify(request);
    } catch (err) {
      throw new GodotConnectionError(
        `Could not serialize parameters for ${method}: ${(err as Error).message}`
      );
    }

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(method, timeoutMs));
      }, timeoutMs);

      const fail = (err: Error) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (value: JsonRpcResponse) => void,
        reject,
        timer,
      });

      // Report a send failure as such. Without the callback an async write
      // error is swallowed and the caller waits out the full timeout, which
      // reads as "Godot is slow" rather than "the message never left".
      this.client!.send(payload, (err?: Error) => {
        if (err) {
          fail(
            new GodotConnectionError(
              `Failed to send ${method} to Godot: ${err.message}`
            )
          );
        }
      });
    });
  }

  /**
   * Token the editor may demand before accepting commands. Optional and off by
   * default: when the editor does not ask, none of this runs.
   */
  private resolveAuthToken(): string | null {
    const inline = process.env.GODOT_MCP_TOKEN;
    if (inline && inline.trim()) return inline.trim();
    const file = process.env.GODOT_MCP_TOKEN_FILE;
    if (file) {
      try {
        return readFileSync(file, "utf-8").trim();
      } catch (err) {
        console.error(`[MCP] Could not read GODOT_MCP_TOKEN_FILE: ${(err as Error).message}`);
      }
    }
    return null;
  }

  private sendAuth(ws: WebSocket): void {
    const token = this.resolveAuthToken();
    if (!token) {
      console.error(
        "[MCP] The editor requires a connection token, but neither GODOT_MCP_TOKEN nor GODOT_MCP_TOKEN_FILE is set. " +
        "The token is in the project's user://mcp_auth_token — see SECURITY.md."
      );
      return;
    }
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      method: "auth",
      params: { token },
      id: randomUUID(),
    }));
  }

  private handleMessage(data: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(data);
    } catch {
      console.error("[MCP] Failed to parse message from Godot:", data);
      return;
    }

    // The editor asks for a token only when its owner opted in.
    if ((msg as unknown as { method?: string }).method === "auth_required") {
      if (this.client) this.sendAuth(this.client);
      return;
    }

    const method = (msg as unknown as { method?: string }).method;
    if (method === "pong") {
      this.lastPongAt = Date.now();
      return;
    }

    // Godot may also send unsolicited pings — reply so its inactivity timer resets
    if (method === "ping") {
      this.lastPongAt = Date.now();
      if (this.isConnected()) {
        this.client!.send(JSON.stringify({ jsonrpc: "2.0", method: "pong", params: {} }));
      }
      return;
    }

    if (!msg.id) return;

    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(msg.id);

    if (msg.error) {
      pending.reject(
        new GodotCommandError(
          msg.error.code,
          msg.error.message,
          msg.error.data
        )
      );
    } else {
      pending.resolve(msg.result as unknown as JsonRpcResponse);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return;

      // If Godot has been silent for too long, the socket is likely half-open.
      // terminate() forcibly destroys the TCP socket (vs close() which waits
      // for a FIN ack that will never arrive on a dead link).
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        console.error(
          `[MCP] Heartbeat timeout (no pong for ${HEARTBEAT_TIMEOUT_MS}ms) — terminating dead connection`
        );
        const dead = this.client;
        this.client = null;
        this.stopHeartbeat();
        this.rejectAllPending(
          new GodotConnectionError("Heartbeat timeout — Godot connection lost")
        );
        dead?.terminate();
        return;
      }

      this.client!.send(
        JSON.stringify({ jsonrpc: "2.0", method: "ping", params: {} })
      );
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
