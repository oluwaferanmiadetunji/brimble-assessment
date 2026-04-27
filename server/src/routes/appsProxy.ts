import express = require('express')
import http = require('http')
import type { IncomingMessage } from 'http'

const router = express.Router()

function hostPortForDeployment(id: number) {
  const base = Number(process.env.DEPLOY_HOST_PORT_BASE ?? 40000)
  return base + (id % 10000)
}

function getUpstreamHost() {
  return process.env.DEPLOY_HOST_GATEWAY ?? 'host.docker.internal'
}

function stripPrefix(url: string, prefix: string) {
  if (!url.startsWith(prefix)) return url
  const rest = url.slice(prefix.length)
  return rest.startsWith('/') ? rest : `/${rest}`
}

router.use('/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10)
  if (!Number.isFinite(id)) return res.status(400).send('id must be an integer')

  const upstreamHost = getUpstreamHost()
  const upstreamPort = hostPortForDeployment(id)

  const prefix = `/apps/${id}`
  const upstreamPath = stripPrefix(req.originalUrl, prefix)

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue
    if (Array.isArray(v)) headers[k] = v.join(',')
    else headers[k] = String(v)
  }

  headers.host = `${upstreamHost}:${upstreamPort}`

  const proxyReq = http.request(
    {
      host: upstreamHost,
      port: upstreamPort,
      method: req.method,
      path: upstreamPath,
      headers,
    },
    (proxyRes: IncomingMessage) => {
      res.statusCode = proxyRes.statusCode ?? 502
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v == null) continue
        res.setHeader(k, v as string)
      }
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(502)
    res.end('upstream unavailable')
  })

  req.pipe(proxyReq)
})

export = router
