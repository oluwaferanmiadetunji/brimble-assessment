const path = require('path') as typeof import('path')
const fs = require('fs') as typeof import('fs')

function normalizeGitUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, '')
  const m = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (m) return `https://github.com/${m[1]}/${m[2]}.git`
  return trimmed
}

function chooseUploadContextDir(finalDir: string) {
  const topEntries = fs.readdirSync(finalDir, { withFileTypes: true })
  const nonDot = topEntries.filter((e) => !e.name.startsWith('.'))
  const dirs = nonDot.filter((e) => e.isDirectory())
  const files = nonDot.filter((e) => e.isFile())
  if (dirs.length === 1 && files.length === 0) {
    const onlyDir = dirs[0]
    if (!onlyDir) return finalDir
    return path.join(finalDir, onlyDir.name)
  }
  return finalDir
}

module.exports = { normalizeGitUrl, chooseUploadContextDir }

