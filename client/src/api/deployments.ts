import { API_BASE, fetchJson } from './client'

export type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'running' | 'failed'

export type Deployment = {
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

export type DeploymentLog = {
  id: number
  deployment_id: number
  stage: string | null
  level: string | null
  message: string
  created_at: string
  updated_at: string
}

export type ListDeploymentsResponse = {
  items: Deployment[]
  limit: number
  offset: number
  total: number
}

export async function listDeployments(params: { limit: number; offset: number }) {
  const qs = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) })
  return await fetchJson<ListDeploymentsResponse>(`/deployments?${qs.toString()}`)
}

export async function getDeployment(id: number) {
  return await fetchJson<{ deployment: Deployment; logs: DeploymentLog[] }>(`/deployments/${id}`)
}

export async function getDeploymentLogs(params: { id: number; limit?: number }) {
  const qs = new URLSearchParams()
  if (params.limit != null) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return await fetchJson<{ deployment_id: number; logs: DeploymentLog[] }>(`/deployments/${params.id}/logs${suffix}`)
}

export async function createDeployment(input: { source_type: 'git' | 'upload'; source_url?: string; upload_path?: string }) {
  return await fetchJson<Deployment>(`/deployments`, { method: 'POST', body: JSON.stringify(input) })
}

export function streamDeploymentLogs(id: number, onLog: (log: DeploymentLog) => void) {
  const es = new EventSource(`${API_BASE}/deployments/${id}/logs/stream`)
  const onMessage = (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data) as DeploymentLog
      onLog(parsed)
    } catch {
      // ignore
    }
  }
  es.addEventListener('log', onMessage as EventListener)

  return () => {
    es.removeEventListener('log', onMessage as EventListener)
    es.close()
  }
}

