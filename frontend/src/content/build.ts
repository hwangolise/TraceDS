// Small builders that keep exercise content files readable. Data only, no logic.

import type { Frame, HeapObject, ObjectId, Value, Variable } from '../engine/types'

export const ref = (target: ObjectId | null): Value => ({ kind: 'ref', target })
export const int = (value: number): Value => ({ kind: 'int', value })
export const unspecified: Value = { kind: 'unspecified' }

export const v = (name: string, value: Value): Variable => ({ name, value })

export const frame = (method: string, variables: Variable[]): Frame => ({ method, variables })

/** A Node drawn as [field | next]; `field` is "data" (generic) or "digit" (BigNum). */
export function node(id: ObjectId, field: 'data' | 'digit', value: number, next: ObjectId | null): HeapObject {
  return { id, type: 'Node', fields: [{ name: field, value: int(value) }, { name: 'next', value: ref(next) }] }
}

export function bigNum(id: ObjectId, myHead: Value, mySize: number): HeapObject {
  return { id, type: 'BigNum', fields: [{ name: 'myHead', value: myHead }, { name: 'mySize', value: int(mySize) }] }
}
