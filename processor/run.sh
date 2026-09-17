#!/usr/bin/env bash
# Wrapper so the bearer token can live in a local .env file instead of the
# systemd unit's Environment= line. landing-page regenerates that unit from
# its own template/registry (including on every boot), which silently wipes
# any manual Environment= line added by hand — this sidesteps that entirely.
# Point landing-page's exec command at this script's absolute path.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

exec .venv/bin/python3 bug_triage.py --poll --interval 300
