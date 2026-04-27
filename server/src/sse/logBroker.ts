import type express from 'express'

type LogRow = Record<string, unknown>

const subsByDeployment = new Map<number, Set<express.Response>>()

function subscribe(deploymentId: number, res: express.Response) {
  let set = subsByDeployment.get(deploymentId)
  if (!set) {
    set = new Set()
    subsByDeployment.set(deploymentId, set)
  }
  set.add(res)
}

function unsubscribe(deploymentId: number, res: express.Response) {
  const set = subsByDeployment.get(deploymentId)
  if (!set) return
  set.delete(res)
  if (set.size === 0) subsByDeployment.delete(deploymentId)
}

function broadcastLog(deploymentId: number, row: LogRow) {
  const set = subsByDeployment.get(deploymentId)
  if (!set || set.size === 0) return

  const payload = `event: log\ndata: ${JSON.stringify(row)}\n\n`
  for (const res of set) {
    try {
      res.write(payload)
    } catch {
      // ignore broken streams; cleanup happens on close handlers
    }
  }
}

export = { subscribe, unsubscribe, broadcastLog }
