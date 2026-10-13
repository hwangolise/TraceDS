// U1 The UI does not duplicate exercise correctness logic (docs/ARCHITECTURE.md
// §3, §4.3; the engine alone decides correctness). Screens and
// components never read the correct answer or misconceptions from content;
// they display what the engine returns in the run.

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

  it.each(uiFiles.map((f) => [relative(srcDir, f).replace(/\\/g, '/'), f]))(
    '%s does not import analytics',
    (_name, file) => {
      const code = readFileSync(file, 'utf8')
      expect(code).not.toMatch(/from ['"].*analytics/)
    },
  )
})
