export type DeploymentStatus =
  | 'pending'
  | 'building'
  | 'deploying'
  | 'running'
  | 'failed'

export type DeploymentLogStage =
  | 'SYSTEM'
  | 'BUILD'
  | 'IMAGE'
  | 'CADDY'
  | 'DEPLOY'
  | 'RUNTIME'

export type DeploymentLog = {
  time: string
  stage: DeploymentLogStage
  msg: string
}

export type Deployment = {
  id: string
  name: string
  shortId: string
  sourceType: string
  sourceIcon: string
  time: string
  version: string
  status: DeploymentStatus
  url: string | null
  logs: DeploymentLog[]
}
