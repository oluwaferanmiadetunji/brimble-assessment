/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const input = require('./deploymentsInput.ts') as {
  normalizeGitUrl: (raw: string) => string
  chooseUploadContextDir: (finalDir: string) => string
}

describe('normalizeGitUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(input.normalizeGitUrl('https://github.com/org/repo   ')).toBe(
      'https://github.com/org/repo',
    )
    expect(input.normalizeGitUrl('https://github.com/org/repo/')).toBe(
      'https://github.com/org/repo',
    )
  })

  it('normalizes GitHub scp-like ssh URL to https', () => {
    expect(
      input.normalizeGitUrl('git@github.com:kubevela/vela-hello-world.git'),
    ).toBe('https://github.com/kubevela/vela-hello-world.git')
    expect(
      input.normalizeGitUrl('git@github.com:kubevela/vela-hello-world'),
    ).toBe('https://github.com/kubevela/vela-hello-world.git')
  })
})

describe('chooseUploadContextDir', () => {
  it('returns nested single directory when zip wraps repo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brimble-upload-'))
    const wrapped = path.join(root, 'repo-master')
    fs.mkdirSync(wrapped, { recursive: true })
    fs.writeFileSync(path.join(wrapped, 'package.json'), '{"name":"x"}')
    expect(input.chooseUploadContextDir(root)).toBe(wrapped)
  })

  it('returns original dir when multiple entries exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brimble-upload-'))
    fs.mkdirSync(path.join(root, 'a'), { recursive: true })
    fs.mkdirSync(path.join(root, 'b'), { recursive: true })
    expect(input.chooseUploadContextDir(root)).toBe(root)
  })
})
