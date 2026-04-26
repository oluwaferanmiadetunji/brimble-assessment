import exec = require('../utils/execStream')

async function railpackBuild(input: {
  contextPath: string
  imageTag: string
  onLine: (line: string) => void
}) {
  const cmd = process.env.RAILPACK_CMD ?? 'railpack'

  const argsEnv = process.env.RAILPACK_ARGS
  const args = argsEnv
    ? argsEnv.split(' ').filter(Boolean).map((s) =>
        s === '{context}' ? input.contextPath : s === '{tag}' ? input.imageTag : s,
      )
    : ['build', input.contextPath, '--tag', input.imageTag]

  await exec.execStream(cmd, args, {
    onLine: (line) => input.onLine(line),
  })
}

export = { railpackBuild }
