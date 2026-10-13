// Reads the exercise *text* (code, questions, choices, hints, explanations)
// straight from docs/EXERCISES.md, so content tests can check the TypeScript
// content files against the approved spec verbatim. Written independently of
// the content files. Wrapped markdown lines are joined with single spaces.

import { exercisesMarkdown } from './states'

export interface DocChoice {
  id: string
  correct: boolean
  text: string
  misconceptionId?: string
  hint?: string
}

export interface DocCheckpoint {
  id: string
  lines: number[]
  focus?: string
  concept: string
  question: string
  choices: DocChoice[]
  explanation: string
}

export interface DocExercise {
  id: string
  title: string
  objective: string
  code: string[]
  checkpoints: DocCheckpoint[]
}

const join = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean).join(' ')

function section(markdown: string, exerciseId: string): string {
  const start = markdown.indexOf(`## ${exerciseId} — `)
  if (start === -1) throw new Error(`${exerciseId} not found in EXERCISES.md`)
  const end = markdown.indexOf('\n## ', start + 1)
  return markdown.slice(start, end === -1 ? undefined : end)
}

/** "1", "1–2", "2, 6", "11, 12, 14, 15" → numbers. */
function parseLines(spec: string): number[] {
  return spec.split(',').flatMap((part) => {
    const [a, b] = part.trim().split('–').map(Number)
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i)
  })
}

/** Text after `**Label:**` up to the next blank line. */
function paragraph(body: string, label: string): string {
  const at = body.indexOf(`**${label}:**`)
  if (at === -1) throw new Error(`missing **${label}:**`)
  const rest = body.slice(at + label.length + 5)
  return join(rest.split(/\n\s*\n/)[0].split('\n'))
}

function parseChoices(body: string): DocChoice[] {
  const lines = body.split('\n')
  const choices: DocChoice[] = []
  let current: DocChoice | null = null
  let mode: 'text' | 'hint' | null = null
  let buffer: string[] = []

  const flush = () => {
    if (!current) return
    if (mode === 'text') current.text = join(buffer)
    if (mode === 'hint') current.hint = join(buffer)
    buffer = []
  }

  for (const line of lines) {
    const start = line.match(/^- `([a-d])` (✓|✗) — (.*)$/)
    const misconception = line.match(/^ {2}- Misconception: `([a-z0-9-]+)`/)
    const hint = line.match(/^ {2}- Hint: (.*)$/)
    if (start) {
      flush()
      current = { id: start[1], correct: start[2] === '✓', text: '' }
      choices.push(current)
      mode = 'text'
      buffer = [start[3]]
    } else if (misconception && current) {
      flush()
      current.misconceptionId = misconception[1]
      mode = null
    } else if (hint && current) {
      flush()
      mode = 'hint'
      buffer = [hint[1]]
    } else if (line.trim() === '' || line.startsWith('**')) {
      flush()
      mode = null
      if (line.startsWith('**')) break
    } else if (mode) {
      buffer.push(line)
    }
  }
  flush()
  return choices
}

export function docExercise(exerciseId: string, markdown = exercisesMarkdown): DocExercise {
  const body = section(markdown, exerciseId)
  const title = body.match(/^## [A-Z]+-\d+ — (.*)$/m)![1].trim()

  const objectiveAt = body.indexOf('- **Learning objective:**')
  const objectiveRest = body.slice(objectiveAt + '- **Learning objective:**'.length)
  const objective = join(objectiveRest.split(/\n- \*\*/)[0].split('\n'))

  const javaAt = body.indexOf('### Java shown to student')
  const java = body.slice(javaAt).match(/```java\n([\s\S]*?)```/)![1]
  const code = java
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.match(/^\s*\d+(?: {2}(.*))?$/)![1] ?? '')

  const prefix = exerciseId.replace('-', '').toLowerCase()
  const headings = [...body.matchAll(new RegExp(`^### (${prefix}-c\\d+) · lines? ([0-9, –]+?)(?: · focus \`(.+?)\`)? · \`([a-z-]+)\`$`, 'gm'))]
  const checkpoints = headings.map((h, i) => {
    const start = h.index!
    const end = i + 1 < headings.length ? headings[i + 1].index! : body.indexOf('\n### ', start + 1)
    const cp = body.slice(start, end === -1 ? undefined : end)
    return {
      id: h[1],
      lines: parseLines(h[2]),
      ...(h[3] ? { focus: h[3] } : {}),
      concept: h[4],
      question: paragraph(cp, 'Question'),
      choices: parseChoices(cp.slice(cp.indexOf('**Question:**')).split('\n').slice(1).join('\n')),
      explanation: paragraph(cp, 'Explanation'),
    }
  })

  return { id: exerciseId, title, objective, code, checkpoints }
}
