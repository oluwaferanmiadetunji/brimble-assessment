## Brimble assessment — one-page deployment pipeline

- **Frontend**: one-page UI to create deployments, view status, and stream logs live.
- **Backend**: API + SQLite state + deployment runner.
- **Pipeline**: build with **Railpack** → run with **Docker** → route via **Caddy** (single ingress).

Everything boots with a single `docker compose up`.

## Tech stack

- **Frontend**: React + TypeScript, Vite, Tailwind, TanStack Router + TanStack Query, SSE (EventSource), `react-hot-toast`
- **Backend**: Node.js + TypeScript, Express, SQLite (`better-sqlite3`)
- **Build**: Railpack (invoked via a Docker wrapper)
- **Runtime**: Docker (deployments run as containers on the host Docker engine)
- **Ingress**: Caddy (reverse-proxy for UI, API, and deployed apps)
- **Build engine**: BuildKit (`moby/buildkit`)

## Architecture overview

### High-level flow

1. User submits either:
   - a **Git URL** (`https://…` or `git@github.com:…`) or
   - an **uploaded archive** (`.zip`, `.tar.gz`, `.tgz`)
2. Backend creates a `deployments` row (SQLite) and appends logs to `deployment_logs`.
3. Backend runs the pipeline:
   - **Build** image using Railpack
   - **Run** container locally via Docker (`docker run … -p hostPort:containerPort`)
   - **Route** traffic via Caddy at `/apps/<deploymentId>/`
4. Frontend:
   - lists deployments (`GET /api/deployments`)
   - shows a deployment + recent logs (`GET /api/deployments/:id`)
   - streams logs live via SSE (`GET /api/deployments/:id/logs/stream`)

### Ingress routing (Caddy)

From [`caddy/Caddyfile`](caddy/Caddyfile):

- `/api/*` → backend (Caddy strips `/api`)
- `/apps/*` → backend app-proxy (backend forwards to the correct deployed container)
- `/` → frontend (Vite preview server)

### Deployed apps path proxy

Deployed containers are exposed on host ports starting at `DEPLOY_HOST_PORT_BASE` (default `40000`).

The backend handles `/apps/<id>/*` by:

- computing the host port for `<id>`
- stripping the `/apps/<id>` prefix
- proxying to `http://host.docker.internal:<computedPort>/...`

This keeps **Caddy as the single ingress** and supports path-based routing.

## Running the stack

### Prereqs

- Docker Desktop (or Docker Engine + Compose plugin)

### Start

At repo root:

```bash
docker compose up --build
```

### URLs

- **UI**: `http://localhost/`
- **API health**: `http://localhost/api/health`
- **Example deployed app**: `http://localhost/apps/<deploymentId>/`

## Using the UI

### Git deployments

Paste either of these (whitespace is trimmed):

- `https://github.com/kubevela/vela-hello-world`
- `git@github.com:kubevela/vela-hello-world.git` (normalized to HTTPS for cloning in Docker)

### Upload deployments

- Upload a `.zip`, `.tar.gz`, or `.tgz` (max **200MB**)
- The backend validates type/size and extracts safely (zip-slip protection)
- GitHub “Download ZIP” archives are supported (single top-level folder is automatically unwrapped)

## Trade-offs / notes

- **No polling**: status updates are driven by SSE log events and targeted query invalidation.
- **Port detection**: deployments assume an internal container port via `DEPLOY_CONTAINER_PORT` (default `3000`) and we pass `PORT` into the container env.
- **Security**: archive extraction has basic hardening (path traversal protection; tar link entries rejected). This is not a production-grade sandbox.
- **Scaling**: the runner is local-process based (no queue/orchestrator). In production this would be replaced by a job system + scheduler.

## What I’d improve with more time

- Stream explicit **status** SSE events (not only logs)
- Better “app type” detection for uploads and clearer UX messaging
- Optional router param routes instead of hash links
- Container lifecycle improvements (zero-downtime redeploys, graceful shutdown)

