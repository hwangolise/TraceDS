// Text alternative for the diagram (docs/ARCHITECTURE.md §6.3).
//
// Deterministic and complete: every reference, value, null, unspecified
// field, unreachable object, and output line is stated in words. Objects are
// numbered in diagram order ("node 1", "BigNum 2"). Internal object ids are
// never mentioned.

import type { HeapObject, ProgramState, Value } from '../engine/types'
import { layout } from './layout'

const NOT_SHOWN = 'not shown in this exercise'

export function describe(state: ProgramState): string {
  const l = layout(state)
  const objects = new Map(state.heap.map((o) => [o.id, o]))

  // Number objects in diagram order, separately for Nodes and BigNums.
  const label = new Map<string, string>()
  const ordered: { object: HeapObject; unreachable: boolean }[] = []
  let nodeCount = 0
  let bigNumCount = 0
  for (const box of l.boxes) {
    if (box.kind !== 'node' && box.kind !== 'bignum') continue
    const object = objects.get(box.objectId)!
    label.set(object.id, box.kind === 'node' ? `node ${++nodeCount}` : `BigNum ${++bigNumCount}`)
    ordered.push({ object, unreachable: box.unreachable })
  }
  const named = (id: string) => label.get(id) ?? 'an unknown object'
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

  const sentences: string[] = []

  // 1. Variables.
  const totalVariables = state.frames.reduce((n, f) => n + f.variables.length, 0)
  if (totalVariables === 0) {
    sentences.push('No variables yet.')
  } else {
    for (const frame of state.frames) {
      const parts = frame.variables.map((v) => variableSentence(v.name, v.value, named))
      if (state.frames.length > 1) {
        sentences.push(`In ${frame.method}: ${parts.length > 0 ? parts.join(' ') : 'no variables.'}`)
      } else {
        sentences.push(...parts)
      }
    }
  }

  // 2. Objects, in diagram order.
  for (const { object } of ordered) {
    const self = capital(named(object.id))
    if (object.type === 'BigNum') {
      const myHead = object.fields.find((f) => f.name === 'myHead')?.value
      const mySize = object.fields.find((f) => f.name === 'mySize')?.value
      const size = mySize?.kind === 'int' ? mySize.value : '?'
      if (!myHead || myHead.kind === 'unspecified') sentences.push(`${self} has mySize ${size}; myHead: ${NOT_SHOWN}.`)
      else sentences.push(`${self} has mySize ${size}, and its myHead ${refPhrase(myHead, named)}.`)
    } else {
      const [first, next] = object.fields
      const value = first?.value.kind === 'int' ? first.value.value : '?'
      if (!next || next.value.kind === 'unspecified') sentences.push(`${self} has ${first?.name} ${value}; next: ${NOT_SHOWN}.`)
      else sentences.push(`${self} has ${first?.name} ${value}, and its next ${refPhrase(next.value, named)}.`)
    }
  }

  // 3. A list summary for each variable that starts a row of the diagram.
  const seen = new Set<string>()
  for (const frame of state.frames) {
    for (const v of frame.variables) {
      if (v.value.kind !== 'ref' || v.value.target === null || !objects.has(v.value.target)) continue
      if (!seen.has(v.value.target)) {
        markRow(v.value.target, objects, seen)
        const object = objects.get(v.value.target)!
        if (object.type === 'BigNum') {
          const myHead = object.fields.find((f) => f.name === 'myHead')?.value
          if (myHead?.kind === 'ref') {
            sentences.push(`List from ${v.name}.myHead: ${chain(myHead.target, objects, named)}.`)
          }
        } else {
          sentences.push(`List from ${v.name}: ${chain(object.id, objects, named)}.`)
        }
      }
    }
  }

  // 4. Unreachable objects.
  for (const { object, unreachable } of ordered) {
    if (unreachable) sentences.push(`${capital(named(object.id))} is unreachable.`)
  }

  // 5. Output.
  sentences.push(state.output.length === 0 ? 'Output: none.' : `Output: ${state.output.join(', ')}.`)

  return sentences.join(' ')
}

function variableSentence(name: string, value: Value, named: (id: string) => string): string {
  switch (value.kind) {
    case 'int':
      return `${name} is ${value.value}.`
    case 'unspecified':
      return `${name}: ${NOT_SHOWN}.`
    case 'ref':
      return value.target === null ? `${name} is null.` : `${name} refers to ${named(value.target)}.`
  }
}

function refPhrase(value: Value, named: (id: string) => string): string {
  if (value.kind === 'ref') return value.target === null ? 'is null' : `refers to ${named(value.target)}`
  return `: ${NOT_SHOWN}`
}

/** Marks every object reachable along link fields from `start`, so later variables don't repeat its list. */
function markRow(start: string, objects: Map<string, HeapObject>, seen: Set<string>): void {
  let id: string | null = start
  while (id !== null && !seen.has(id) && objects.has(id)) {
    seen.add(id)
    const object: HeapObject = objects.get(id)!
    const link = object.fields.find((f) => f.name === (object.type === 'BigNum' ? 'myHead' : 'next'))
    id = link?.value.kind === 'ref' ? link.value.target : null
  }
}

/** "4 → 7 → 1 → null", following next fields; stops at null, "?", or a repeated node. */
function chain(start: string | null, objects: Map<string, HeapObject>, named: (id: string) => string): string {
  const parts: string[] = []
  const visited = new Set<string>()
  let id: string | null = start
  while (true) {
    if (id === null) {
      parts.push('null')
      break
    }
    if (visited.has(id)) {
      parts.push(`back to ${named(id)}`)
      break
    }
    const object = objects.get(id)
    if (!object) break
    visited.add(id)
    const [first, next] = object.fields
    parts.push(first?.value.kind === 'int' ? String(first.value.value) : '?')
    if (!next || next.value.kind !== 'ref') {
      parts.push('?')
      break
    }
    id = next.value.target
  }
  return parts.join(' → ')
}
