// @vitest-environment jsdom
// F-A1, F-A2 — anonymous session id (docs/ANALYTICS.md §2, docs/ARCHITECTURE.md §8).
// Each test re-imports the module, which models a fresh page load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { blockLocalStorageAccess, UUID } from '../fixtures/analyticsWire'

const KEY = 'traceds.sessionId'

async function loadSession() {
  vi.resetModules()
  return import('../../src/analytics/session')
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('session id persisted (F-A1)', () => {
  it('generates a UUID on first visit and stores it under traceds.sessionId', async () => {
    const { getSessionId } = await loadSession()
    const id = getSessionId()
    expect(id).toMatch(UUID)
    expect(window.localStorage.getItem(KEY)).toBe(id)
  })

  it('returns the same id on the second call', async () => {
    const { getSessionId } = await loadSession()
    expect(getSessionId()).toBe(getSessionId())
  })

  it('returns the same id after a reload (read back from storage)', async () => {
    const first = (await loadSession()).getSessionId()
    const second = (await loadSession()).getSessionId()
    expect(second).toBe(first)
  })

  it('reuses an id already in storage and leaves it unchanged', async () => {
    const existing = '2f1c6a0e-8d3b-4a57-9c1e-5b7d2e4f6a80'
    window.localStorage.setItem(KEY, existing)
    const { getSessionId } = await loadSession()
    expect(getSessionId()).toBe(existing)
    expect(window.localStorage.getItem(KEY)).toBe(existing)
  })

  it('gives a different browser (empty storage) a different id', async () => {
    const first = (await loadSession()).getSessionId()
    window.localStorage.clear()
    const second = (await loadSession()).getSessionId()
    expect(second).toMatch(UUID)
    expect(second).not.toBe(first)
  })
})

describe('storage unavailable (F-A2)', () => {
  it('reads and writes throw: returns an in-memory UUID, stable for the page, without throwing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const { getSessionId } = await loadSession()
    let first = ''
    expect(() => (first = getSessionId())).not.toThrow()
    expect(first).toMatch(UUID)
    expect(getSessionId()).toBe(first)
  })

  it('writes throw (quota exceeded): still a stable UUID for the page', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const { getSessionId } = await loadSession()
    const first = getSessionId()
    expect(first).toMatch(UUID)
    expect(getSessionId()).toBe(first)
  })

  it('accessing localStorage itself throws (storage blocked): still a stable UUID, no throw', async () => {
    const restore = blockLocalStorageAccess()
    try {
      const { getSessionId } = await loadSession()
      let first = ''
      expect(() => (first = getSessionId())).not.toThrow()
      expect(first).toMatch(UUID)
      expect(getSessionId()).toBe(first)
    } finally {
      restore()
    }
  })
})
