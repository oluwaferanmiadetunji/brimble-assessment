import db = require('./database')

function requireOne(name: string) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger') AND name = ?`).get(name) as
    | { name: string }
    | undefined
  if (!row) throw new Error(`Missing schema object: ${name}`)
}

function main() {
  ;[
    'deployments',
    'deployment_logs',
    'idx_deployments_created_at',
    'idx_deployments_status',
    'idx_deployment_logs_deployment_created',
    'deployments_set_updated_at',
    'deployment_logs_set_updated_at',
  ].forEach(requireOne)

  console.log('OK: schema present')
}

main()

