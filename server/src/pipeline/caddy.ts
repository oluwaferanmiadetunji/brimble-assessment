import exec = require('../utils/execStream')

async function caddyReloadIfAvailable(input: { onLine: (line: string) => void }) {
  const cmd = process.env.CADDY_RELOAD_CMD
  if (!cmd) return
  const parts = cmd.split(' ').filter(Boolean)
  const [bin, ...args] = parts
  if (!bin) return
  await exec.execStream(bin, args, { onLine: (line) => input.onLine(line) })
}

export = { caddyReloadIfAvailable }
