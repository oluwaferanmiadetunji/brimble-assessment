import express = require('express')
import deploymentsRouter = require('./routes/deployments')
import appsProxyRouter = require('./routes/appsProxy')

const app = express()

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  )
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Last-Event-ID',
  )
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

app.use('/deployments', express.json(), deploymentsRouter)
app.use('/apps', appsProxyRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

const port = Number(process.env.PORT ?? 3001)
app.listen(port, '0.0.0.0', () => {
  console.log(`server listening on :${port}`)
})
