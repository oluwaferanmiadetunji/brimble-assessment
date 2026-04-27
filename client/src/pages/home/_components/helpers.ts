import * as React from 'react'
import type {
  Deployment as ApiDeployment,
  DeploymentLog as ApiDeploymentLog,
} from '../../../api/deployments'
import type { Deployment, DeploymentLog, DeploymentLogStage } from '../types'

export function deploymentIdFromHash() {
  const m = window.location.hash.match(/#deployment-(\d+)/)
  return m ? Number(m[1]) : null
}

export function toTemplateDeployment(dep: ApiDeployment): Deployment {
  const name =
    dep.source_url?.split('/').filter(Boolean).pop() ??
    (dep.source_type === 'upload' ? 'manual-upload' : `dep-${dep.id}`)

  return {
    id: `dep-${dep.id}`,
    name,
    shortId: `#${dep.id}`,
    sourceType: dep.source_type === 'git' ? 'main' : 'manual upload',
    sourceIcon: 'solar:branch-linear',
    time: new Date(dep.created_at).toLocaleString(),
    version: dep.image_tag,
    status: dep.status,
    url: dep.public_url ? dep.public_url.replace(/^https?:\/\//, '') : null,
    logs: [],
  }
}

export function hrefForPublicUrl(publicUrlWithoutScheme: string) {
  const u = publicUrlWithoutScheme.trim()
  if (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(u)) return `http://${u}`
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u}`
}

export function toTemplateLog(row: ApiDeploymentLog): DeploymentLog {
  const stageMap: Record<string, DeploymentLogStage> = {
    queued: 'SYSTEM',
    build: 'BUILD',
    run: 'DEPLOY',
    caddy: 'CADDY',
    runtime: 'RUNTIME',
  }
  return {
    time: new Date(row.created_at).toLocaleTimeString(),
    stage: stageMap[row.stage ?? ''] ?? 'SYSTEM',
    msg: row.message,
  }
}

export function IconifyIcon(
  props: React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLElement>,
    HTMLElement
  > & {
    icon: string
    strokeWidth?: number | string
    ['stroke-width']?: number | string
  } & { className?: string },
) {
  const { className, strokeWidth, ...rest } = props
  const finalProps: Record<string, unknown> = { ...rest }
  if (className) finalProps.class = className
  if (strokeWidth != null) finalProps['stroke-width'] = strokeWidth
  return React.createElement(
    'iconify-icon',
    (finalProps as unknown) as React.HTMLAttributes<HTMLElement>,
  )
}
