/* eslint-disable no-console */
import { spawnSync } from 'node:child_process'

const BASE = process.env.BASE_URL ?? 'http://localhost'
const API = `${BASE}/api`
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 8 * 60_000)
const REPO_URL = process.env.E2E_REPO_URL ?? 'https://github.com/heroku/node-js-getting-started'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}: ${text}`)
  }
  return json
}

async function waitForOk(url, deadlineMs) {
  while (Date.now() < deadlineMs) {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.ok) return
    } catch {
      // ignore
    }
    await sleep(500)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function createDeploymentGit() {
  const dep = await fetchJson(`${API}/deployments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_type: 'git', source_url: REPO_URL }),
  })
  if (!dep?.id) throw new Error(`Unexpected create response: ${JSON.stringify(dep)}`)
  return dep.id
}

async function waitForSseRunning(deploymentId, deadlineMs) {
  const url = `${API}/deployments/${deploymentId}/logs/stream`
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'text/event-stream' },
  })
  if (!res.ok || !res.body) throw new Error(`SSE connect failed: HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (Date.now() < deadlineMs) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    // SSE frames are separated by blank line.
    for (;;) {
      const idx = buf.indexOf('\n\n')
      if (idx === -1) break
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)

      // We only care about `event: log` frames.
      if (!frame.includes('event: log')) continue
      const dataLine = frame
        .split('\n')
        .find((l) => l.startsWith('data: '))
      if (!dataLine) continue
      const data = dataLine.slice('data: '.length)
      try {
        const row = JSON.parse(data)
        const msg = String(row?.message ?? '')
        if (/deployment running/i.test(msg)) {
          try {
            reader.cancel()
          } catch {}
          return
        }
      } catch {
        // ignore
      }
    }
  }

  throw new Error(`Timed out waiting for deployment ${deploymentId} to reach running`)
}

async function verifyAppReachable(deploymentId) {
  const url = `${BASE}/apps/${deploymentId}/`
  const deadline = Date.now() + 30_000
  let lastStatus = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' })
      lastStatus = res.status
      if (res.ok) return
    } catch {
      // ignore
    }
    await sleep(500)
  }
  throw new Error(`App not reachable: HTTP ${lastStatus ?? 'unknown'}`)
}

function runComposeUp() {
  const p = spawnSync('docker', ['compose', 'up', '-d', '--build'], {
    stdio: 'inherit',
  })
  if (p.status !== 0) throw new Error('docker compose up failed')
}

async function main() {
  const deadline = Date.now() + TIMEOUT_MS

  console.log(`[e2e] bringing up compose stack`)
  runComposeUp()

  console.log(`[e2e] waiting for API + UI readiness`)
  await waitForOk(`${API}/health`, deadline)
  await waitForOk(`${BASE}/`, deadline)

  console.log(`[e2e] creating deployment from ${REPO_URL}`)
  const id = await createDeploymentGit()
  console.log(`[e2e] created deployment id=${id}`)

  console.log(`[e2e] waiting for SSE terminal success`)
  await waitForSseRunning(id, deadline)

  console.log(`[e2e] verifying app reachable at /apps/${id}/`)
  await verifyAppReachable(id)

  console.log(`[e2e] OK`)
}

main().catch((err) => {
  console.error(`[e2e] FAILED: ${err?.message ?? err}`)
  process.exit(1)
})

