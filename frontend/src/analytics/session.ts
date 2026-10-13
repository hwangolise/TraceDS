// Anonymous session id (docs/ANALYTICS.md §2, docs/ARCHITECTURE.md §8).
//
// A random UUID kept in localStorage['traceds.sessionId']. If storage is
// unavailable (private mode, blocked site data), an in-memory UUID is used for
// the page lifetime. Every storage access is in try/catch.

import { newUuid, UUID_PATTERN } from './uuid'

const KEY = 'traceds.sessionId'

let cached: string | undefined

/** The browser's anonymous session id: persisted in localStorage, in-memory fallback. */
export function getSessionId(): string {
  if (cached) return cached
  try {
    const stored = window.localStorage.getItem(KEY)
    if (stored && UUID_PATTERN.test(stored)) {
      cached = stored
      return cached
    }
  } catch {
    // storage unavailable: use an in-memory id
  }
  cached = newUuid()
  try {
    window.localStorage.setItem(KEY, cached)
  } catch {
    // not persisted; stable for this page load
  }
  return cached
}
