// Exercises completed on this device (decision A9). Stored locally only: no
// account, no network. Browser storage may be unavailable, so every access is
// guarded and failures are ignored.

const KEY = 'traceds.completed'

export function loadCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function markCompleted(exerciseId: string): void {
  try {
    const completed = loadCompleted()
    completed.add(exerciseId)
    localStorage.setItem(KEY, JSON.stringify([...completed]))
  } catch {
    // Storage unavailable (private mode, blocked): completion just isn't remembered.
  }
}
