import { describe, expect, it } from 'vitest'
import { hrefForPublicUrl } from './helpers'

describe('hrefForPublicUrl', () => {
  it('forces http for localhost', () => {
    expect(hrefForPublicUrl('localhost/apps/1/')).toBe('http://localhost/apps/1/')
    expect(hrefForPublicUrl('127.0.0.1:40000/')).toBe('http://127.0.0.1:40000/')
  })

  it('defaults to https for non-local hosts', () => {
    expect(hrefForPublicUrl('example.com/apps/1/')).toBe('https://example.com/apps/1/')
  })

  it('keeps explicit scheme if provided', () => {
    expect(hrefForPublicUrl('http://example.com')).toBe('http://example.com')
    expect(hrefForPublicUrl('https://example.com')).toBe('https://example.com')
  })
})

