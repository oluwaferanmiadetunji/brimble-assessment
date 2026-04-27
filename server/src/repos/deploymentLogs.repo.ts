import db = require('../database')
import broker = require('../sse/logBroker')

type LogStage = 'queued' | 'build' | 'run' | 'caddy' | 'runtime'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogRow = {
  id: number
  deployment_id: number
  stage: LogStage | null
  level: string | null
  message: string
  created_at: string
  updated_at: string
}

const insertStmt = db.prepare(`
  INSERT INTO deployment_logs (deployment_id, stage, level, message)
  VALUES (@deployment_id, @stage, @level, @message)
`)

const listByDeploymentStmt = db.prepare(`
  SELECT *
  FROM deployment_logs
  WHERE deployment_id = ?
  ORDER BY id ASC
`)

const listRecentByDeploymentStmt = db.prepare(`
  SELECT *
  FROM deployment_logs
  WHERE deployment_id = @deployment_id
  ORDER BY id DESC
  LIMIT @limit
`)

function appendLog(
  deploymentId: number,
  input: { stage: LogStage; level: LogLevel; message: string },
) {
  const info = insertStmt.run({
    deployment_id: deploymentId,
    stage: input.stage,
    level: input.level,
    message: input.message,
  })
  const id = Number(info.lastInsertRowid)
  const row = db
    .prepare(`SELECT * FROM deployment_logs WHERE id = ?`)
    .get(id) as LogRow
  broker.broadcastLog(deploymentId, (row as unknown) as Record<string, unknown>)
  return row
}

function listByDeployment(deploymentId: number) {
  return listByDeploymentStmt.all(deploymentId) as LogRow[]
}

function listRecentByDeployment(input: {
  deploymentId: number
  limit: number
}) {
  const rows = listRecentByDeploymentStmt.all({
    deployment_id: input.deploymentId,
    limit: input.limit,
  }) as LogRow[]
  rows.reverse()
  return rows
}

export = {
  appendLog,
  listByDeployment,
  listRecentByDeployment,
}
