# Brimble assessment — one-page deployment pipeline

- **Frontend**: one-page UI to create deployments, view status, and stream logs live  
- **Backend**: API + SQLite state + deployment runner  
- **Pipeline**: **Railpack → Docker → Caddy** (single ingress)

Runs end-to-end with:
```bash
docker compose up --build
```

---

## Design goals

- **End-to-end simplicity** — single command boot
- **Explicit pipeline** — `pending → building → deploying → running → failed`
- **Real-time feedback** — logs stream live (SSE)
- **Minimal surface** — no external infra
- **Single ingress** — all traffic via Caddy

> Not production-ready.

---

## Tech stack

- **Frontend**: React + TS, Vite, Tailwind, TanStack Router + Query, SSE
- **Backend**: Node.js + TS, Express, SQLite (`better-sqlite3`)
- **Build**: Railpack (Docker wrapper, BuildKit)
- **Runtime**: Docker (host engine)
- **Ingress**: Caddy

---

## System diagram

```
User
  ↓
Frontend (Vite)
  ↓
Backend API (Express)
  ↓
Pipeline Runner
  ├─ Railpack (build → image)
  ├─ Docker (run container)
  └─ Caddy (route traffic)
  ↓
Running App
```

---

## Request / data flow

```
POST /deployments
  ↓
create row (status=pending)
  ↓
spawn background job
  ↓
[build] → [run] → [route]
  ↓
write logs → DB
  ↓
SSE stream → UI
```

---

## Sequence diagram (pipeline execution)

```
User        Frontend        Backend        Runner        Railpack        Docker        Caddy
 |              |              |              |              |              |              |
 |  click deploy|              |              |              |              |              |
 |------------->| POST /deployments          |              |              |              |
 |              |------------->| create row (pending)       |              |              |
 |              |<-------------| 200 OK                    |              |              |
 |              |              | spawn job --------------->|              |              |
 |              |              |              | build ---->|              |              |
 |              |              |              |<-- logs ----              |              |
 |              |              |              | run --------------------->| start ctr    |
 |              |              |              |<-- logs ------------------              |
 |              |              |              | route --------------------------------->| config
 |              |              |              |<-- logs --------------------------------|
 |              |              |<-- stream logs (SSE) ----------------------------------|
 |              |<-------------|                                               updates  |
```

---

## Architecture overview

Pipeline model:
```
source → build → image → container → routed app
```

Lifecycle:
```
pending → building → deploying → running → failed
```

### Why this shape

- **Single deployment = single pipeline**
- **Logs-first design** (persist + stream)
- **Caddy as single ingress**
- **Backend controls routing** (no dynamic Caddy reloads)

---

## Pipeline execution model

- API returns immediately
- background runner executes steps
- stdout/stderr → `deployment_logs`
- logs:
  - persisted (history)
  - streamed (SSE)

---

## Build (Railpack)

Railpack replaces Dockerfiles:

- detects runtime
- installs deps
- builds app
- outputs container image

**Trade-off**
- less control vs Dockerfile
- much faster onboarding

---

## Log streaming (SSE)

**Why SSE**
- server → client only (perfect for logs)
- simpler than WebSockets
- auto-reconnect

**Trade-offs**
- no bidirectional comms
- less flexible

---

## Routing (Caddy)

```
/api/*   → backend
/apps/*  → backend proxy → container
/        → frontend
```

---

## App routing model

```
/apps/<id> → backend → container:port
```

Backend:
- maps id → port
- strips prefix
- proxies request

---

## Running

```bash
docker compose up --build
```

URLs:
- UI: http://localhost/
- API: http://localhost/api/health
- App: http://localhost/apps/<id>/

Test repo (Git URL):
- https://github.com/kubevela/vela-hello-world.git

---

## Trade-offs

- Static port → simple, limited  
- Local runner → no scheduling  
- Path routing → simpler than DNS  
- Docker socket → unsafe in prod  
- SQLite → single-node  

---

## What this demonstrates

- build systems (source → image)
- container lifecycle
- reverse proxy routing
- real-time streaming (SSE)
- pipeline orchestration

---

## Improvements

- job queue + workers
- better port detection
- graceful deploys
- build cache reuse
- stronger sandboxing

## Brimble Deployment feedback
I deployed a project using Brimble: https://oluwaferanmiadetunji.brimble.app/


The core flow works, but there are a few UX rough edges. The first issue I hit was around deployment type selection. After choosing GitHub, it wasn’t obvious how to switch back to another option. I initially clicked “Back to projects” a couple of times before noticing the small “Change” text next to the GitHub label. The transition itself is clear, but the affordance to change it is too subtle for something that controls the entire flow.

The deployment run/logs drawer also has a confusing interaction model. After triggering a deployment, a bottom drawer appears with logs, but clicking outside it does nothing.

There are also a few smaller feedback gaps. For example, clicking the share button just changes it to a green check without any tooltip or message, so it’s unclear what action was completed (copied link, shared, etc.). Similarly, the “Visit Site” action isn’t very prominent and looks more like plain text than a primary action, which makes it easy to miss.

One notable gap is the lack of rollback support. While environment variables and configuration are handled, there’s no obvious way to revert to a previous successful deployment, which is something I’d expect from a platform like this.

What I’d improve

- make deployment type switching more discoverable
- add clear feedback for actions like sharing (tooltip or confirmation message)
- make primary actions like “Visit Site” more visually prominent
- add support for rolling back to previous deployments