import deploymentsRepo = require('../repos/deployments.repo')
import logsRepo = require('../repos/deploymentLogs.repo')
import railpack = require('./railpack')
import docker = require('./docker')
import caddy = require('./caddy')
import exec = require('../utils/execStream')
import fs = require('fs')
import path = require('path')

function log(deploymentId: number, stage: 'queued' | 'build' | 'run' | 'caddy' | 'runtime', level: 'info' | 'warn' | 'error', message: string) {
  logsRepo.appendLog(deploymentId, { stage, level, message })
}

function getDefaultContainerPort() {
  return Number(process.env.DEPLOY_CONTAINER_PORT ?? 3000)
}

function hostPortForDeployment(id: number) {
  const base = Number(process.env.DEPLOY_HOST_PORT_BASE ?? 40000)
  return base + (id % 10000)
}

function publicUrlForDeployment(id: number) {
  const base = process.env.PUBLIC_BASE_URL ?? 'http://localhost'
  return `${base}/apps/${id}/`
}

async function runDeployment(deploymentId: number) {
  const dep = deploymentsRepo.getById(deploymentId)
  if (!dep) throw new Error(`deployment ${deploymentId} not found`)

  try {
    deploymentsRepo.updateStatus(deploymentId, 'building')
    log(deploymentId, 'build', 'info', `Starting build for ${dep.source_type} deployment...`)

    let contextPath: string
    if (dep.source_type === 'git') {
      if (!dep.source_url) throw new Error('source_url missing for git deployment')
      const root = process.env.WORKDIR_ROOT ?? '/tmp/brimble'
      fs.mkdirSync(root, { recursive: true })
      contextPath = path.join(root, `dep-${deploymentId}`)
      try {
        fs.rmSync(contextPath, { recursive: true, force: true })
      } catch {
        // ignore
      }
      log(deploymentId, 'build', 'info', `Cloning ${dep.source_url}...`)
      await exec.execStream('git', ['clone', '--depth', '1', dep.source_url, contextPath], {
        onLine: (line) => log(deploymentId, 'build', 'info', line),
      })
    } else {
      contextPath = dep.upload_path ?? ''
      if (!contextPath) throw new Error('upload_path missing for upload deployment')
    }

    await railpack.railpackBuild({
      contextPath,
      imageTag: dep.image_tag,
      onLine: (line) => log(deploymentId, 'build', 'info', line),
    })

    deploymentsRepo.updateStatus(deploymentId, 'deploying')
    log(deploymentId, 'run', 'info', 'Starting container...')

    const containerPort = getDefaultContainerPort()
    const hostPort = hostPortForDeployment(deploymentId)

   
    try {
      await docker.dockerRmForce({ containerName: dep.container_name, onLine: (line) => log(deploymentId, 'run', 'info', line) })
    } catch {
      
    }

    await docker.dockerRun({
      imageTag: dep.image_tag,
      containerName: dep.container_name,
      hostPort,
      containerPort,
      onLine: (line) => log(deploymentId, 'run', 'info', line),
    })

    log(deploymentId, 'caddy', 'info', 'Reloading Caddy (if configured)...')
    await caddy.caddyReloadIfAvailable({ onLine: (line) => log(deploymentId, 'caddy', 'info', line) })

    const publicUrl = publicUrlForDeployment(deploymentId)
    deploymentsRepo.setRunningInfo(deploymentId, {
      public_url: publicUrl,
      internal_port: String(containerPort),
      started_at: new Date().toISOString(),
    })
    deploymentsRepo.updateStatus(deploymentId, 'running')
    log(deploymentId, 'runtime', 'info', `Deployment running. Public URL: ${publicUrl} (container on localhost:${hostPort})`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    deploymentsRepo.setFailed(deploymentId, { last_error: msg })
    log(deploymentId, 'runtime', 'error', msg)
    throw err
  }
}

export = { runDeployment }

