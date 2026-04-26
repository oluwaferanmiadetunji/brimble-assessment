import cp = require('child_process')
import readline = require('readline')

type LineSink = (line: string, meta: { stream: 'stdout' | 'stderr' }) => void

async function execStream(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; onLine: LineSink },
) {
  return await new Promise<void>((resolve, reject) => {
    const child = cp.spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutRl = readline.createInterface({ input: child.stdout })
    const stderrRl = readline.createInterface({ input: child.stderr })

    stdoutRl.on('line', (line) => opts.onLine(line, { stream: 'stdout' }))
    stderrRl.on('line', (line) => opts.onLine(line, { stream: 'stderr' }))

    child.on('error', reject)
    child.on('close', (code) => {
      stdoutRl.close()
      stderrRl.close()
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

export = { execStream }
