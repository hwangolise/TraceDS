// U1 The UI does not duplicate exercise correctness logic (docs/ARCHITECTURE.md
// §3, §4.3; the engine alone decides correctness). Screens and
// components never read the correct answer or misconceptions from content;
// they display what the engine returns in the run. Since M7, U1 also holds the
// UI side of the analytics boundary (see the last block).

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.(ts|tsx)$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  )
}

const uiFiles = [...sourceFiles(join(srcDir, 'screens')), ...sourceFiles(join(srcDir, 'components')), join(srcDir, 'App.tsx')]

describe('U1 UI contains no correctness logic', () => {
  it('finds the UI sources', () => {
    const names = uiFiles.map((f) => relative(srcDir, f).replace(/\\/g, '/'))
    expect(names).toEqual(expect.arrayContaining(['App.tsx', 'screens/ExerciseScreen.tsx']))
  })

  it.each(uiFiles.map((f) => [relative(srcDir, f).replace(/\\/g, '/'), f]))(
    '%s never reads correctChoiceId or misconceptions from content',
    (_name, file) => {
      const code = readFileSync(file, 'utf8')
      expect(code).not.toMatch(/correctChoiceId/)
      expect(code).not.toMatch(/\.misconception\b/)
    },
  )

  // Analytics boundary (redefined in M7A review, decision A; ANALYTICS §7 "UI
  // boundary", ARCHITECTURE §8). ModuleScreen and ExerciseScreen emit events,
  // but UI code may only call the approved tracking interface
  // (src/analytics/events.ts). Delivery (fetch, batching, retry) and storage
  // live behind it and never appear in UI code.
  it.each(uiFiles.map((f) => [relative(srcDir, f).replace(/\\/g, '/'), f]))(
    '%s imports analytics only through analytics/events',
    (_name, file) => {
      const code = readFileSync(file, 'utf8')
      const specs = [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]*analytics[^'"]*)['"]/g)].map((m) => m[1])
      for (const spec of specs) {
        const resolved = relative(srcDir, join(file, '..', spec)).replace(/\\/g, '/').replace(/\.(ts|tsx)$/, '')
        expect(resolved, `"${spec}" is not the approved tracking interface`).toBe('analytics/events')
      }
    },
  )

  it.each(['screens/ModuleScreen.tsx', 'screens/ExerciseScreen.tsx'])(
    '%s emits through the approved tracking interface (ANALYTICS §7)',
    (name) => {
      const code = readFileSync(join(srcDir, name), 'utf8')
      expect(code).toMatch(/from\s*['"]\.\.\/analytics\/events(\.ts)?['"]/)
    },
  )

  it.each(uiFiles.map((f) => [relative(srcDir, f).replace(/\\/g, '/'), f]))(
    '%s contains no network delivery, session, transport, or analytics-id code',
    (_name, file) => {
      const code = readFileSync(file, 'utf8')
      for (const forbidden of [
        // network delivery and transport details
        /\bfetch\s*\(/, /sendBeacon/, /XMLHttpRequest/, /keepalive/, /\/api\/v1/, /VITE_API_BASE_URL/,
        // session management and the delivery client
        /traceds\.sessionId/, /getSessionId/, /createAnalyticsClient/,
        // analytics UUIDs (run_id, event_id) belong to the analytics layer (final M7A decision 7)
        /randomUUID/, /getRandomValues/,
      ]) {
        expect(code, `matches ${forbidden}`).not.toMatch(forbidden)
      }
    },
  )
})
