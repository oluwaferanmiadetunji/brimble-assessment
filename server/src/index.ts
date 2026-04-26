import express = require('express')
import deploymentsRouter = require('./routes/deployments')

const app = express()
app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

app.use('/deployments', deploymentsRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on :${port}`)
})
