# Remaining TODOs (Brimble take-home)

## Hard requirements to finish
- [ ] **End-to-end `docker compose up`**
  - [ ] Add a `docker-compose.yml` at repo root that boots **client**, **server**, **caddy**, and anything Railpack needs
  - [ ] Ensure sensible defaults (no external accounts needed)
  - [ ] Document any required env vars (prefer defaults)
  - [ ] If backend runs Docker, mount the docker socket: `/var/run/docker.sock:/var/run/docker.sock`

- [ ] **Caddy ingress**
  - [ ] Decide routing strategy (recommended for local): **path-based** `/apps/:deploymentId/*`
  - [ ] Add `Caddyfile` (or use admin API) to route traffic to the right container/port
  - [ ] Implement reliable reload/update mechanism from the backend

- [ ] **Railpack build produces runnable images**
  - [ ] Confirm the exact Railpack CLI invocation (make it deterministic)
  - [ ] Make sure it works in the compose environment (not only on host)
  - [ ] Ensure image tags created by backend match what Railpack builds

- [ ] **Live log streaming**
  - [x] Backend SSE endpoint exists and streams `event: log`
  - [x] Logs persist in SQLite and history endpoint exists
  - [ ] Validate streaming works end-to-end in the compose environment (not just locally)

- [ ] **Brimble deploy + honest feedback**
  - [ ] Deploy something on Brimble
  - [ ] Add the Brimble URL + 1–2 paragraphs of direct feedback in README

## Pipeline correctness / robustness
- [ ] **Internal port handling**
  - [ ] Decide how the platform determines the container’s internal port (convention/env, Railpack output parsing, config file, etc.)
  - [ ] Store `internal_port` accurately in `deployments`

- [ ] **Container lifecycle**
  - [ ] Handle redeploy (cleanup/replace old containers safely)
  - [ ] Add graceful stop and remove logic (optional, but helpful)

- [ ] **Upload deployments (if you want it truly supported)**
  - [ ] Add real upload endpoint (multipart) on the server
  - [ ] Persist uploaded archive to disk, extract it, then build with Railpack

## Docs / ergonomics
- [ ] **README.md**
  - [ ] How to run: `docker compose up`
  - [ ] Architecture overview (UI → API → build → run → route)
  - [ ] Notes on trade-offs + what you’d improve with more time

## Nice-to-have (don’t block submission)
- [ ] Replace hash-based deployment selection with a TanStack Router param route
- [ ] Improve log panel UX: autoscroll “stick to bottom” with a scroll-to-bottom button
- [ ] Pagination controls for deployments list (`limit`/`offset`)

