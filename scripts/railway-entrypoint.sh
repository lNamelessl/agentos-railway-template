#!/bin/sh
set -eu

umask 077

# TEMP-DIAG: wipe persisted state (clean-volume boot hypothesis test)
rm -rf /data/agentos /data/openclaw /data/openclaw-config /data/workspaces /data/browser-profiles

service_role=$(printf '%s' "${AGENTOS_SERVICE_ROLE:-agentos}" | tr '[:upper:]' '[:lower:]')

if [ "$service_role" = "browser-worker" ]; then
  export AGENTOS_BROWSER_WORKER_HOST="${AGENTOS_BROWSER_WORKER_HOST:-::}"
  export AGENTOS_BROWSER_DISABLE_CHROMIUM_SANDBOX="${AGENTOS_BROWSER_DISABLE_CHROMIUM_SANDBOX:-1}"
  exec /agentos/scripts/railway-browser-worker-entrypoint.sh
fi

# Railway can inject a service PORT even when its generated public domain still
# targets the template default (3000). Keep the public proxy and Next.js listener
# aligned for every fresh template deployment.
export PORT=3000

if [ "${RAILWAY_ENVIRONMENT_ID:-}" != "" ] && [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" != "/data" ]; then
  echo "AgentOS requires a Railway volume mounted at /data." >&2
  exit 1
fi

if [ "${OPENCLAW_GATEWAY_TOKEN:-}" = "" ]; then
  echo "OPENCLAW_GATEWAY_TOKEN is required. Configure it with a generated Railway template secret." >&2
  exit 1
fi

if [ "${AGENTOS_API_TOKEN:-}" = "" ]; then
  echo "AGENTOS_API_TOKEN is required. Configure it with a generated Railway template secret." >&2
  exit 1
fi

mkdir -p /data/agentos/mission-control /data/browser-profiles /data/openclaw /data/openclaw-config /data/workspaces
chown node:node \
  /data \
  /data/agentos \
  /data/agentos/mission-control \
  /data/browser-profiles \
  /data/openclaw \
  /data/openclaw-config \
  /data/workspaces
chmod 0700 \
  /data/agentos \
  /data/agentos/mission-control \
  /data/browser-profiles \
  /data/openclaw \
  /data/openclaw-config \
  /data/workspaces

if [ ! -s /data/agentos/instance-protection.json ] && [ "${AGENTOS_INITIAL_ADMIN_PASSWORD:-}" = "" ]; then
  echo "AGENTOS_INITIAL_ADMIN_PASSWORD is required for the first deployment." >&2
  exit 1
fi

# TEMP-DIAG: background self-probe logger (20 samples, 20s apart)
(
  i=0
  while [ "$i" -lt 20 ]; do
    sleep 20
    ports=$(awk 'NR>1 {print $2}' /proc/net/tcp /proc/net/tcp6 2>/dev/null | cut -d: -f2 | sort -u | tr '\n' ' ')
    healthz=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:3000/_agentos/healthz 2>/dev/null || echo ERR)
    login=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:3000/login 2>/dev/null || echo ERR)
    gw=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:18789/healthz 2>/dev/null || echo ERR)
    echo "TEMP-DIAG t=$((i+1)*20)s ports=[$ports] self_healthz=$healthz self_login=$login gw_healthz=$gw"
    i=$((i+1))
  done
) &

exec gosu node:node node /agentos/scripts/railway-supervisor.mjs
