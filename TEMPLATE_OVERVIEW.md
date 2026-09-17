# AgentOS — Self-Hosted AI Workforce (OpenClaw-Powered)

One-click, self-hosted **AI workforce orchestration**. [AgentOS](https://github.com/SapienXai/AgentOS) is the human operating layer above the [OpenClaw](https://github.com/openclaw) agent runtime: manage agents like a company — workspaces, tasks, missions, model providers, approvals, and runtime visibility from a single hardened control plane.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/ZK0-tR)

## What you get

- **One hardened `AgentOS` service** — the AgentOS 0.8.0 control plane (Next.js) and the pinned OpenClaw `2026.9.4` Gateway, co-located and supervised in a single container. The supervisor keeps the Gateway healthy, restarts it on failure, and exposes only AgentOS to the public internet.
- **A persistent `/data` volume** — AgentOS operator state, OpenClaw configuration, device identity, credentials, sessions, and agent workspaces all survive redeploys and restarts.
- **Auth enforced by default** — every page redirects to `/login`, every API returns `401` without a session. Login is rate-limited, mutations require authenticated same-origin requests, and the container drops to a non-root user after boot.
- **Zero deploy-form inputs** — all three secrets (`AGENTOS_INITIAL_ADMIN_PASSWORD`, `OPENCLAW_GATEWAY_TOKEN`, `AGENTOS_API_TOKEN`) are generated per deployment by Railway. No provider API key is needed to boot: the service deploys green with a "connect me" setup state and blocks chat/mission dispatch until you plug in a provider.
- **Healthy boot in ~3-5 minutes** — `/api/health` healthcheck (300s timeout), `ON_FAILURE` restart policy, single replica.

## Post-deploy steps

1. Open your new service in Railway and copy the generated `AGENTOS_INITIAL_ADMIN_PASSWORD` from the **Variables** tab.
2. Open the generated HTTPS domain and sign in as `admin` with that password.
3. Delete `AGENTOS_INITIAL_ADMIN_PASSWORD` from the service variables (the account lives on the volume; the variable is only used once at first boot).
4. In **Setup Center**, connect a model provider (e.g. an OpenAI- or Anthropic-compatible API key) and choose the default model.
5. Create a workspace and dispatch your first agent task.

# Deploy and Host

Deploying AgentOS on Railway provisions a single supervised container that runs the AgentOS control plane and its OpenClaw Gateway runtime together, with one persistent volume for all durable state. The service listens on port `3000` behind Railway's HTTPS domain, health-checks on `/api/health`, and restarts on failure (max 10 retries). You do not need any API key at deploy time; the deployment reaches a healthy state unconfigured and waits for you to connect a model provider.

## About Hosting

Hosting AgentOS yourself means your agents' credentials, sessions, workspace files, and task history stay inside your own Railway project and its encrypted volume, in one region you control, instead of on a third-party SaaS. The template pins the exact upstream revision (AgentOS 0.8.0, OpenClaw Gateway 2026.9.4) in a public, reproducible repository, so your deployment is auditable and upgradable on your schedule. Interactive Chromium (Live View / Secure Browser) runs in-container on loopback only; raw VNC and CDP ports are never exposed. Plan for roughly the cost of one small always-on container plus volume storage.

## Why Deploy

- **Managed agent runtime without managed-SaaS risk** — OpenClaw is the kernel, AgentOS is the operating layer, and both run under a supervisor that watches Gateway liveness and recovers from crashes automatically.
- **One-click reproducibility** — the template deploys from a pinned, vendored upstream repository with digest-pinned base images; a weekly smoke-tested GitHub Action tracks upstream so updates are a merge, not a migration.
- **Secure by default** — generated admin password (not a default you share), machine tokens generated per deployment, loopback-only internal services, same-origin mutation enforcement, and rate-limited login.
- **Healthy zero-key boot** — deploy first, connect your provider when ready; nothing calls out to any model provider until you configure one.

## Common Use Cases

- Run a private "AI workforce": multiple OpenClaw agents working in workspaces with human approval gates and mission control.
- Self-hosted agent operations for a small team, with per-workspace file sharing under `/data/workspaces`.
- Automations that need browser sessions (Live View) with credentials kept on your own volume.
- A staging ground for evaluating model providers — swap providers and default models from Setup Center without redeploying.

## Dependencies for

AgentOS itself has no external database or queue dependency — all durable state (Operator/Instance Protection data, OpenClaw configuration and sessions, workspace files) lives on the attached `/data` volume, and the OpenClaw Gateway runs on container loopback.

### Deployment Dependencies

- **Railway volume** (`/data`) — provisioned automatically by the template; required for boot and all persistent state. Keep replicas at 1; a writable OpenClaw runtime must not be shared horizontally.
- **A model provider API key (brought by you, post-deploy)** — AgentOS boots healthy without it, but chat, mission dispatch, and runtime smoke tests stay blocked until you connect a provider (OpenAI, Anthropic, Ollama, and other OpenClaw-supported providers) in Setup Center and pick a default model.
- **GitHub** — the service builds from the public pinned repository `lNamelessl/agentos-railway-template` (vendored AgentOS upstream + deployment Dockerfile); no tokens required.

## Troubleshooting

- **Deployment fails the healthcheck on a fresh volume** — first boot creates accounts and the Gateway baseline; the 300s timeout covers it. If it still fails, check deploy logs for volume mount errors: the volume must stay mounted at `/data`.
- **`502` from the domain** — the public domain must target port `3000` (the entrypoint aligns the proxy and app to it automatically).
- **Locked out** — credentials are on the volume; redeploying does not reset the account. Use the documented Instance Protection reset deliberately from a Railway shell.
- **Chat is disabled ("configure me")** — connect a provider and choose a default model in Setup Center; AgentOS intentionally blocks dispatch with zero providers configured.
- **Upgrades** — merge the weekly `upstream-bump` PR (it only opens after a successful Docker build smoke test), then redeploy. Back up both `/data` contents before major version jumps.
