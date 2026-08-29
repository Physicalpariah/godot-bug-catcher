export declare class GodotConnection {
    private wss;
    private client;
    private port;
    private fixedPort;
    private basePort;
    private maxPort;
    private pendingRequests;
    private heartbeatTimer;
    private lastPongAt;
    private connectPromise;
    private clientWaitPromise;
    private shutDown;
    private bindFailure;
    constructor(port?: number, fixedPort?: boolean, options?: {
        basePort?: number;
        maxPort?: number;
    });
    /**
     * Start WebSocket server, retrying on the next port if the first bind races.
     * Safe to call repeatedly; concurrent calls share one in-flight attempt.
     */
    connect(): Promise<void>;
    private connectOnce;
    /**
     * Called before giving up on a command. If this server never bound a port —
     * every slot was held at startup — retry the bind now, then give the editor
     * a moment to dial in (it rescans every 3s). Without this a single startup
     * bind failure kills the whole session even after the blocking process exits.
     */
    private ensureConnected;
    private waitForClient;
    /** Explains *why* there is no usable connection, without blaming the editor wrongly. */
    private disconnectedReason;
    /**
     * Try to bind a single WebSocketServer. Resolves once 'listening' fires,
     * rejects on bind error or if neither event arrives.
     *
     * The timeout matters: sendCommand now reaches connect() on every call, so a
     * socket that never fires either event would hang the tool call forever
     * rather than merely failing startup once.
     */
    private bindWebSocketServer;
    private attachConnectionHandler;
    disconnect(): void;
    isConnected(): boolean;
    getPort(): number;
    /**
     * `timeoutMs` overrides the default per-command deadline. Needed by commands
     * that legitimately run for minutes — a headless test suite, for instance —
     * which would otherwise be reported as failed while still running.
     */
    sendCommand(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
    /**
     * Token the editor may demand before accepting commands. Optional and off by
     * default: when the editor does not ask, none of this runs.
     */
    private resolveAuthToken;
    private sendAuth;
    private handleMessage;
    private rejectAllPending;
    private startHeartbeat;
    private stopHeartbeat;
}
//# sourceMappingURL=godot-connection.d.ts.map