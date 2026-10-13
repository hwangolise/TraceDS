// What changed between two program states, for highlighting after a transition
// (docs/ARCHITECTURE.md §6.1). Derived; never authored.

import type { ProgramState, Value } from '../engine/types'
import type { ChangeSet } from './types'

function sameValue(a: Value | undefined, b: Value | undefined): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === 'int' && b.kind === 'int') return a.value === b.value
  if (a.kind === 'ref' && b.kind === 'ref') return a.target === b.target
  return true
}

export function diff(before: ProgramState, after: ProgramState): ChangeSet {
  const beforeObjects = new Map(before.heap.map((o) => [o.id, o]))
  const afterIds = new Set(after.heap.map((o) => o.id))
  const objects: string[] = []
  const fields: string[] = []

  for (const object of after.heap) {
    const previous = beforeObjects.get(object.id)
    if (!previous) {
      objects.push(object.id)
      continue
    }
    let changed = false
    for (const field of object.fields) {
      const old = previous.fields.find((f) => f.name === field.name)
      if (!sameValue(old?.value, field.value)) {
        fields.push(`${object.id}.${field.name}`)
        changed = true
      }
    }
    if (changed) objects.push(object.id)
  }
  const removedObjects = before.heap.filter((o) => !afterIds.has(o.id)).map((o) => o.id)

  const variables: string[] = []
  const frameCount = Math.max(before.frames.length, after.frames.length)
  for (let i = 0; i < frameCount; i++) {
    const oldVars = before.frames[i]?.variables ?? []
    const newVars = after.frames[i]?.variables ?? []
    for (const v of newVars) {
      const old = oldVars.find((o) => o.name === v.name)
      if (!old || !sameValue(old.value, v.value)) variables.push(`${i}:${v.name}`)
    }
    for (const old of oldVars) {
      if (!newVars.some((v) => v.name === old.name)) variables.push(`${i}:${old.name}`)
    }
  }

  const outputChanged =
    before.output.length !== after.output.length || before.output.some((line, i) => line !== after.output[i])

  return { objects, removedObjects, fields, variables, outputChanged }
}

export function isEmptyChangeSet(changes: ChangeSet): boolean {
  return (
    changes.objects.length === 0 &&
    changes.removedObjects.length === 0 &&
    changes.fields.length === 0 &&
    changes.variables.length === 0 &&
    !changes.outputChanged
  )
}
