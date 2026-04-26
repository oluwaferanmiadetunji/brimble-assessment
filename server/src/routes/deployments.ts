import express = require('express')
import deploymentsRepo = require('../repos/deployments.repo')
import logsRepo = require('../repos/deploymentLogs.repo')
import runner = require('../pipeline/runDeployment')
import broker = require('../sse/logBroker')

const router = express.Router()

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function parseIntParam(v: unknown) {
  if (typeof v !== 'string' || v.trim() === '') return undefined
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

router.post('/', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const source_type = body.source_type

  if (source_type !== 'git' && source_type !== 'upload') {
    return res
      .status(400)
      .json({ error: 'source_type must be "git" or "upload"' })
  }

  const source_url = body.source_url
  const upload_path = body.upload_path

  if (source_type === 'git') {
    if (!isNonEmptyString(source_url))
      return res.status(400).json({ error: 'source_url is required for git' })
  } else {
    if (!isNonEmptyString(upload_path))
      return res
        .status(400)
        .json({ error: 'upload_path is required for upload' })
  }

  const created = deploymentsRepo.createDeployment({
    source_type,
    source_url: source_type === 'git' ? String(source_url) : null,
    upload_path: source_type === 'upload' ? String(upload_path) : null,
  })

  logsRepo.appendLog(created.id, {
    stage: 'queued',
    level: 'info',
    message: 'Queued. Waiting for available runners...',
  })

  // Fire-and-forget background pipeline.
  setImmediate(() => {
    runner.runDeployment(created.id).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      try {
        deploymentsRepo.setFailed(created.id, { last_error: msg })
        logsRepo.appendLog(created.id, {
          stage: 'runtime',
          level: 'error',
          message: msg,
        })
      } catch {
        // swallow
      }
    })
  })

  return res.status(201).json(created)
})

router.get('/', (req, res) => {
  const limitRaw = parseIntParam(req.query.limit)
  const offsetRaw = parseIntParam(req.query.offset)

  const limit = clamp(limitRaw ?? 20, 1, 100)
  const offset = clamp(offsetRaw ?? 0, 0, 10_000)

  const total = deploymentsRepo.countAll()
  const items = deploymentsRepo.listPage({ limit, offset })

  return res.json({ items, limit, offset, total })
})

router.get('/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id))
    return res.status(400).json({ error: 'id must be an integer' })

  const deployment = deploymentsRepo.getById(id)
  if (!deployment)
    return res.status(404).json({ error: 'deployment not found' })

  const logs = logsRepo.listRecentByDeployment({ deploymentId: id, limit: 200 })
  return res.json({ deployment, logs })
})

router.get('/:id/logs', (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id))
    return res.status(400).json({ error: 'id must be an integer' })

  const deployment = deploymentsRepo.getById(id)
  if (!deployment)
    return res.status(404).json({ error: 'deployment not found' })

  const limitRaw = parseIntParam(req.query.limit)
  const limit = clamp(limitRaw ?? 200, 1, 1000)

  const logs = logsRepo.listRecentByDeployment({ deploymentId: id, limit })
  return res.json({ deployment_id: id, logs })
})

router.get('/:id/logs/stream', (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id))
    return res.status(400).json({ error: 'id must be an integer' })

  const deployment = deploymentsRepo.getById(id)
  if (!deployment)
    return res.status(404).json({ error: 'deployment not found' })

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  broker.subscribe(id, res)

  const recent = logsRepo.listRecentByDeployment({
    deploymentId: id,
    limit: 200,
  })
  for (const row of recent) {
    res.write(`event: log\ndata: ${JSON.stringify(row)}\n\n`)
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`)
    } catch {
      
    }
  }, 15_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    broker.unsubscribe(id, res)
  })
})

export = router
