import fs = require('fs')
import path = require('path')
import crypto = require('crypto')
import unzipper = require('unzipper')
import tar = require('tar')

type ArchiveType = 'zip' | 'targz'

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function isSubPath(parent: string, child: string) {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function safeJoin(destDir: string, entryPath: string) {
  const sanitized = entryPath.replace(/^[\\/]+/, '')
  const outPath = path.resolve(destDir, sanitized)
  if (!isSubPath(destDir, outPath) && outPath !== path.resolve(destDir)) {
    throw new Error(`invalid archive entry path: ${entryPath}`)
  }
  return outPath
}

function detectArchiveType(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip' as const
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz'))
    return 'targz' as const
  return null
}

function sniffMagicBytes(filePath: string): ArchiveType | null {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(4)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    if (n >= 2) {
      // ZIP: 50 4B
      if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip'
      // GZIP: 1F 8B
      if (buf[0] === 0x1f && buf[1] === 0x8b) return 'targz'
    }
    return null
  } finally {
    fs.closeSync(fd)
  }
}

function makeTempDir(root: string, prefix: string) {
  ensureDir(root)
  const rand = crypto.randomBytes(8).toString('hex')
  const dir = path.join(root, `${prefix}-${Date.now()}-${rand}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function extractZip(inputZipPath: string, destDir: string) {
  ensureDir(destDir)
  const directory = await unzipper.Open.file(inputZipPath)

  for (const entry of directory.files) {
    const fileName = entry.path
    const outPath = safeJoin(destDir, fileName)

    if (entry.type === 'Directory') {
      fs.mkdirSync(outPath, { recursive: true })
      continue
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    await new Promise<void>((resolve, reject) => {
      entry
        .stream()
        .pipe(fs.createWriteStream(outPath, { mode: 0o644 }))
        .on('finish', () => resolve())
        .on('error', reject)
    })
  }
}

async function extractTarGz(inputTarGzPath: string, destDir: string) {
  ensureDir(destDir)
  let sawLink = false
  await tar.x({
    file: inputTarGzPath,
    cwd: destDir,
    gzip: true,

    noChmod: true,
    onentry: (entry) => {
      if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
        sawLink = true
        entry.resume()
      }
    },
    filter: (p) => {
      const outPath = safeJoin(destDir, p)

      return !!outPath
    },
  })
  if (sawLink) throw new Error('archive contains symlink/hardlink entries')
}

function assertNonEmptyDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  if (entries.length === 0)
    throw new Error('uploaded archive extracted to an empty directory')
}

export = {
  detectArchiveType,
  sniffMagicBytes,
  makeTempDir,
  extractZip,
  extractTarGz,
  assertNonEmptyDir,
}
