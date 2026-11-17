import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs vitest under jsdom', () => {
    expect(typeof document.createElement).toBe('function')
  })
})
