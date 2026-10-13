import type { ProgramState } from '../engine/types'

/** Ids of heap objects reachable from any frame variable by following references. */
export function reachableObjectIds(state: ProgramState): Set<string> {
  const objects = new Map(state.heap.map((o) => [o.id, o]))
  const reached = new Set<string>()
  const pending: string[] = []

  for (const frame of state.frames) {
    for (const variable of frame.variables) {
      if (variable.value.kind === 'ref' && variable.value.target !== null) pending.push(variable.value.target)
    }
  }

  while (pending.length > 0) {
    const id = pending.pop()!
    const object = objects.get(id)
    if (!object || reached.has(id)) continue
    reached.add(id)
    for (const field of object.fields) {
      if (field.value.kind === 'ref' && field.value.target !== null) pending.push(field.value.target)
    }
  }
  return reached
}
