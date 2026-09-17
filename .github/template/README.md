# AgentOS — Railway Template (source repo)

This repository is the deployment source for the **AgentOS Railway template**: one-click,
self-hosted **AI workforce orchestration** powered by [OpenClaw](https://github.com/openclaw).
AgentOS is the human operating layer above the OpenClaw agent runtime — manage agents,
workspaces, tasks, model providers, approvals, and runtime visibility from one control plane.

> **Upstream project:** [SapienXai/AgentOS](https://github.com/SapienXai/AgentOS) (MIT).
> This repo vendors upstream at a pinned commit so template deploys are reproducible.
> See [`UPSTREAM_PIN`](./UPSTREAM_PIN) for the exact revision, and
> `.github/workflows/weekly-upstream-bump.yml` for the weekly smoke-tested bump automation.

## What one-click deploy creates

- **One public `AgentOS` service** built from `Dockerfile.railway`:
  - Next.js control plane (AgentOS 0.8.0) + pinned OpenClaw Gateway runtime (2026.9.3),
    co-located and supervised in a single container.
  - The supervisor starts the OpenClaw Gateway (container-loopback only), a secure local
    browser worker (container-loopback only), the Next.js app, and a same-origin public
    proxy on port `3000`.
- **One persistent volume** mounted at `/data` holding AgentOS operator state
  (`/data/agentos`), OpenClaw state/config/credentials (`/data/openclaw`,
  `/data/openclaw-config`), and agent workspaces (`/data/workspaces`).
- **Generated secrets** (no user input required at deploy time):
  - `AGENTOS_INITIAL_ADMIN_USERNAME` (`admin`) and `AGENTOS_INITIAL_ADMIN_PASSWORD`
    (generated) — initial sign-in. Copy the password from the service **Variables** tab,
    sign in, then delete the password variable.
  - `OPENCLAW_GATEWAY_TOKEN` and `AGENTOS_API_TOKEN` (generated) — internal service
    authentication.
- **Healthcheck** on `/api/health` (the lightest route; reveals no version/token/account
  detail).

## Security model

- **Auth is enforced by default.** Every page request redirects to `/login`; every API
  request without a session returns `401` with `X-AgentOS-Auth-Required: instance`.
  Login is rate-limited; mutations require an authenticated same-origin request.
- **Auto-generated credentials.** Nothing ships with default passwords. The initial admin
  password is a deploy-time generated secret, used only to create the account on the
  persistent volume, and removed from the running process after bootstrap.
- **Nothing public except AgentOS.** The OpenClaw Gateway and browser worker listen on
  container loopback only. No VNC, CDP, or worker port is exposed.
- **Runs as non-root** after first-boot volume preparation (root is used only to repair
  volume ownership, then the supervisor drops to the `node` user).
- **Zero-key boot is healthy.** With no model provider configured, the service deploys
  green and AgentOS blocks chat/mission dispatch until you connect a provider in
  **Setup Center** and choose a default model. Nothing calls out to any provider until
  you supply a key.

## Getting started

1. Deploy the template from Railway and wait for `/api/health` to go green.
2. Open the generated HTTPS domain.
3. Sign in with username `admin` and the generated `AGENTOS_INITIAL_ADMIN_PASSWORD`
   (Variables tab in Railway). Delete that variable after first sign-in.
4. In **Setup Center**, connect a model provider (API key) and pick the default model.
5. Create a workspace and dispatch your first agent task.

## Optional: dedicated browser worker

The single-service deployment runs interactive Chromium via the in-container secure
browser worker (loopback-only). For isolated browser workloads (Live View, Secure Browser
Accounts), the upstream two-service topology is supported: add a second service from this
same repo with `AGENTOS_SERVICE_ROLE=browser-worker`, `PORT=18794`,
`AGENTOS_BROWSER_WORKER_TOKEN` (shared 64-char secret), and its own `/data` volume, then
set `AGENTOS_BROWSER_WORKER_URL=http://<worker>.railway.internal:18794` on the main
service. See upstream `docs/deploy-on-railway.md`.

## Upstream pinning & updates

- Template deploys build from this pinned snapshot: reproducible and immune to upstream
  churn (upstream pins its own base images and OpenClaw version inside
  `Dockerfile.railway`).
- A weekly GitHub Action checks upstream, and on a new commit replaces the vendored tree,
  runs a `Dockerfile.railway` build smoke test, and opens a bump PR **only if the smoke
  test passes**.
- To bump manually: update the vendored tree and `UPSTREAM_PIN`, then verify
  `docker build -f Dockerfile.railway .`

## License

Upstream AgentOS is MIT-licensed (see [`LICENSE`](./LICENSE)). OpenClaw runtime is pulled
as a pinned upstream image.
