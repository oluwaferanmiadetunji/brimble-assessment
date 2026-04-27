import db = require('../database')

type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'running' | 'failed'

type DeploymentRow = {
  id: number
  source_type: string
  source_url: string | null
  upload_path: string | null
  status: DeploymentStatus
  image_tag: string
  container_name: string
  public_url: string | null
  internal_port: string | null
  last_error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

function nowIso() {
  return new Date().toISOString()
}

function makeImageTag(id: number) {
  const repo = process.env.IMAGE_REPO ?? 'brimble'
  const tag = Date.now().toString(36)
  return `${repo}/dep-${id}:${tag}`
}

function makeContainerName(id: number) {
  return `dep-${id}`
}

const insertStmt = db.prepare(`
  INSERT INTO deployments (
    source_type, source_url, upload_path,
    status, image_tag, container_name,
    public_url, internal_port, last_error, started_at, finished_at
  ) VALUES (
    @source_type, @source_url, @upload_path,
    @status, @image_tag, @container_name,
    NULL, NULL, NULL, NULL, NULL
  )
`)

const getByIdStmt = db.prepare(`SELECT * FROM deployments WHERE id = ?`)

const listPageStmt = db.prepare(`
  SELECT *
  FROM deployments
  ORDER BY id DESC
  LIMIT @limit
  OFFSET @offset
`)

const countAllStmt = db.prepare(`SELECT COUNT(1) AS total FROM deployments`)

const updateStatusStmt = db.prepare(`
  UPDATE deployments
  SET status = @status
  WHERE id = @id
`)

const setFailedStmt = db.prepare(`
  UPDATE deployments
  SET status = 'failed',
      last_error = @last_error,
      finished_at = COALESCE(@finished_at, finished_at)
  WHERE id = @id
`)

const setRunningInfoStmt = db.prepare(`
  UPDATE deployments
  SET public_url = @public_url,
      internal_port = @internal_port,
      started_at = COALESCE(@started_at, started_at),
      finished_at = COALESCE(@finished_at, finished_at)
  WHERE id = @id
`)

const setImageTagStmt = db.prepare(`
  UPDATE deployments
  SET image_tag = @image_tag
  WHERE id = @id
`)

const setUploadPathStmt = db.prepare(`
  UPDATE deployments
  SET upload_path = @upload_path
  WHERE id = @id
`)

function createDeployment(input: { source_type: 'git' | 'upload'; source_url: string | null; upload_path: string | null }) {
  const status: DeploymentStatus = 'pending'
  const tx = db.transaction(() => {
    const info = insertStmt.run({
      source_type: input.source_type,
      source_url: input.source_url,
      upload_path: input.upload_path,
      status,
      image_tag: 'pending',
      container_name: 'pending',
    })

    const id = Number(info.lastInsertRowid)
    const image_tag = makeImageTag(id)
    const container_name = makeContainerName(id)
    
    db.prepare(`UPDATE deployments SET image_tag = ?, container_name = ? WHERE id = ?`).run(image_tag, container_name, id)
    return getByIdStmt.get(id) as DeploymentRow
  })
  return tx()
}

function getById(id: number) {
  return getByIdStmt.get(id) as DeploymentRow | undefined
}

function listPage(input: { limit: number; offset: number }) {
  return listPageStmt.all({ limit: input.limit, offset: input.offset }) as DeploymentRow[]
}

function countAll() {
  const row = countAllStmt.get() as { total: number }
  return row.total
}

function updateStatus(id: number, status: DeploymentStatus) {
  updateStatusStmt.run({ id, status })
}

function setImageTag(id: number, image_tag: string) {
  setImageTagStmt.run({ id, image_tag })
}

function setUploadPath(id: number, upload_path: string) {
  setUploadPathStmt.run({ id, upload_path })
}

function setRunningInfo(
  id: number,
  input: { public_url: string; internal_port: string; started_at?: string; finished_at?: string },
) {
  setRunningInfoStmt.run({
    id,
    public_url: input.public_url,
    internal_port: input.internal_port,
    started_at: input.started_at ?? null,
    finished_at: input.finished_at ?? null,
  })
}

function setFailed(id: number, input: { last_error: string; finished_at?: string }) {
  setFailedStmt.run({ id, last_error: input.last_error, finished_at: input.finished_at ?? nowIso() })
}

export = {
  createDeployment,
  getById,
  listPage,
  countAll,
  updateStatus,
  setImageTag,
  setUploadPath,
  setRunningInfo,
  setFailed,
}

