// M8 boundary: the feedback form reaches the network only through the approved
// tracking interface (analytics/events); the feedback transport lives inside
// src/analytics and nowhere in UI code (ANALYTICS §7, ARCHITECTURE §8).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url))
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  )

describe('M8 feedback boundary', () => {
  it('FeedbackForm imports analytics only through analytics/events', () => {
    const code = readFileSync(join(srcDir, 'components/FeedbackForm.tsx'), 'utf8')
    expect(code).toMatch(/from\s*['"]\.\.\/analytics\/events(\.ts)?['"]/)
    expect(code).not.toMatch(/analytics\/(client|session)/)
  })

  it('the /api/v1/feedback path appears only inside src/analytics', () => {
    const offenders = sourceFiles(srcDir)
      .filter((f) => /\/api\/v1\/feedback|api\/v1\/feedback/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(srcDir, f).replace(/\\/g, '/'))
    expect(offenders.length).toBeGreaterThan(0) // positive control: the transport exists
    expect(offenders.every((f) => f.startsWith('analytics/'))).toBe(true)
  })
})
