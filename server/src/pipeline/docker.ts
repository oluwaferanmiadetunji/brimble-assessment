import exec = require('../utils/execStream')

async function dockerRun(input: {
  imageTag: string
  containerName: string
  hostPort: number
  containerPort: number
  onLine: (line: string) => void
}) {
  await exec.execStream(
    'docker',
    ['run', '-d', '--name', input.containerName, '-e', `PORT=${input.containerPort}`, '-p', `${input.hostPort}:${input.containerPort}`, input.imageTag],
    {
    onLine: (line) => input.onLine(line),
    },
  )
}

async function dockerRmForce(input: { containerName: string; onLine: (line: string) => void }) {
  await exec.execStream('docker', ['rm', '-f', input.containerName], { onLine: (line) => input.onLine(line) })
}

export = { dockerRun, dockerRmForce }
