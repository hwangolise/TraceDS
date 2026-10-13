// Dev-only parser for the state notation in docs/EXERCISES.md §0.2.
//
// It turns the approved spec's states into ProgramStates for the
// visualization tests and the ?viz-harness page, so M2 can render every
// LL-01..LL-04 state before content files exist (M3/M4). It is not used by the
// app at runtime and is not part of the exercise content pipeline.

import type { Field, HeapObject, ProgramState, Value, Variable } from '../engine/types'

export interface DocState {
  /** "ll01-initial" or a checkpoint id such as "ll03-c3". */
  key: string
  exerciseId: string
  state: ProgramState
}

/** Parses "→ A", "→ null", "→ ?", or "= 3". */
function parseValue(text: string): Value {
  const t = text.trim()
  const arrow = t.match(/^→\s*(\S+)$/)
  if (arrow) {
    if (arrow[1] === 'null') return { kind: 'ref', target: null }
    if (arrow[1] === '?') return { kind: 'unspecified' }
    return { kind: 'ref', target: arrow[1] }
  }
  const eq = t.match(/^=\s*(-?\d+)$/)
  if (eq) return { kind: 'int', value: Number(eq[1]) }
  throw new Error(`cannot parse value "${text}"`)
}

/** Parses "A: Node(4 | → B)" or "X: BigNum(myHead → A, mySize = 3)". */
function parseObject(line: string, intField: string): HeapObject {
  const m = line.match(/^([A-Z]):\s*(Node|BigNum)\((.*)\)/)
  if (!m) throw new Error(`cannot parse heap object "${line}"`)
  const [, id, type, body] = m
  if (type === 'Node') {
    const [value, next] = body.split('|').map((s) => s.trim())
    const fields: Field[] = [
      { name: intField, value: { kind: 'int', value: Number(value) } },
      { name: 'next', value: next === 'null' ? { kind: 'ref', target: null } : parseValue(next) },
    ]
    return { id, type: 'Node', fields }
  }
  const fields: Field[] = body.split(',').map((part) => {
    const f = part.trim().match(/^(\w+)\s*(.*)$/)
    if (!f) throw new Error(`cannot parse BigNum field "${part}"`)
    return { name: f[1], value: parseValue(f[2]) }
  })
  return { id, type: 'BigNum', fields }
}

/** Parses "head → A, cur → null, n = 0" or "(no variables)". */
function parseVariables(text: string): Variable[] {
  const t = text.trim()
  if (t === '(no variables)' || t === '') return []
  return t.split(',').map((part) => {
    const m = part.trim().match(/^(\w+)\s*(.*)$/)
    if (!m) throw new Error(`cannot parse variable "${part}"`)
    return { name: m[1], value: parseValue(m[2]) }
  })
}

/** Parses one fenced state block. "(unchanged…)" heaps are copied from `previous`. */
function parseStateBlock(block: string, previous: ProgramState | null, intField: string): ProgramState {
  let method = ''
  let variables: Variable[] = []
  let heap: HeapObject[] | null = null
  let output: string[] = []
  let section: 'heap' | null = null

  for (const raw of block.split('\n')) {
    const line = raw.replace(/\s+\((?:digit field|unreachable)\)\s*$/, '').trimEnd()
    if (!line.trim()) continue
    const frame = line.match(/^frame\s+(\S+):\s*(.*)$/)
    if (frame) {
      method = frame[1]
      variables = parseVariables(frame[2])
      section = null
      continue
    }
    const heapLine = line.match(/^heap:\s*(.*)$/)
    if (heapLine) {
      section = 'heap'
      const rest = heapLine[1].trim()
      if (rest.startsWith('(unchanged') || rest === '(empty)') {
        heap = rest === '(empty)' ? [] : structuredClone(previous?.heap ?? [])
        section = null
      } else {
        heap = [parseObject(rest, intField)]
      }
      continue
    }
    const out = line.match(/^output:\s*(.*)$/)
    if (out) {
      output = [...out[1].matchAll(/"([^"]*)"/g)].map((m) => m[1])
      section = null
      continue
    }
    if (section === 'heap') {
      heap!.push(parseObject(line.trim(), intField))
      continue
    }
    throw new Error(`unexpected line in state block: "${raw}"`)
  }

  return { frames: [{ method, variables }], heap: heap ?? [], output }
}

/** The first fenced block in `text` (``` … ```), if any. */
function firstBlock(text: string): string | null {
  const m = text.match(/```\n([\s\S]*?)```/)
  return m ? m[1] : null
}

/** Every state in LL-01..LL-04: the initial state, then each checkpoint's resulting state. */
export function parseExerciseStates(markdown: string): DocState[] {
  const states: DocState[] = []
  const sections = [...markdown.matchAll(/^## (LL-\d{2}) — /gm)]
  sections.forEach((match, i) => {
    const exerciseId = match[1]
    const prefix = exerciseId.replace('-', '').toLowerCase()
    const start = match.index!
    const end = i + 1 < sections.length ? sections[i + 1].index! : markdown.indexOf('\n## ', start + 1)
    const body = markdown.slice(start, end === -1 ? undefined : end)
    const intField = exerciseId === 'LL-04' ? 'digit' : 'data'

    const initialText = body.slice(body.indexOf('### Initial state'))
    const initialBlock = firstBlock(initialText)
    if (!initialBlock) throw new Error(`${exerciseId}: no initial state block`)
    let previous = parseStateBlock(initialBlock, null, intField)
    states.push({ key: `${prefix}-initial`, exerciseId, state: previous })

    const checkpoints = [...body.matchAll(new RegExp(`^### (${prefix}-c\\d+) `, 'gm'))]
    checkpoints.forEach((cp, j) => {
      const cpStart = cp.index!
      const cpEnd = j + 1 < checkpoints.length ? checkpoints[j + 1].index! : body.indexOf('\n### ', cpStart + 1)
      const cpBody = body.slice(cpStart, cpEnd === -1 ? undefined : cpEnd)
      const resultAt = cpBody.indexOf('**Resulting state')
      if (resultAt === -1) throw new Error(`${cp[1]}: no resulting state`)
      const afterResult = cpBody.slice(resultAt)
      const explanationAt = afterResult.indexOf('**Explanation')
      const resultText = explanationAt === -1 ? afterResult : afterResult.slice(0, explanationAt)
      const block = firstBlock(resultText)
      const state = block ? parseStateBlock(block, previous, intField) : structuredClone(previous)
      states.push({ key: cp[1], exerciseId, state })
      previous = state
    })
  })
  return states
}
