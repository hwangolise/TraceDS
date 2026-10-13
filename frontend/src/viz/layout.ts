// Deterministic layout: ProgramState → positioned boxes and edges
// (docs/ARCHITECTURE.md §6.2). No layout library and no renderer types.
//
// Rows: each variable that refers to a not-yet-placed object starts a row,
// which follows the object's link field (Node.next, BigNum.myHead) left to
// right. Variables holding null get their own null markers on a row after the
// object rows. Unreachable objects go on the last row.

import type { HeapObject, ProgramState, Value } from '../engine/types'
import { reachableObjectIds } from './reachability'
import type { RefDisplay, VizBox, VizEdge, VizLayout, VizScalar } from './types'

/** Smallest zoom at which diagram text stays legible. */
export const MIN_SCALE = 0.8
/** Padding around the diagram when fitting it into a panel, in pixels. */
export const FIT_PADDING = 16

// Box geometry, in pixels at zoom 1. Renderers size their boxes to match.
export const CAPTION_H = 16
export const CELL_H = 40
export const FOOTER_H = 16
export const OBJECT_H = CAPTION_H + CELL_H + FOOTER_H
/** Vertical centre of an object's cells, measured from the box top. Edges attach here. */
export const CELL_CENTER_Y = CAPTION_H + CELL_H / 2
export const NODE_W = 88
export const BIGNUM_W = 128
export const NULL_W = 44
export const NULL_H = 28
export const PILL_H = 24
const PILL_ARROW = 20
const PILL_GAP_X = 8
const PILL_CHAR_W = 8
const PILL_PADDING_X = 16
const COL_GAP = 40
const ROW_GAP = 24

/** Width of a variable pill: monospace label plus padding. Renderers use the same value. */
export function pillWidth(name: string): number {
  return Math.max(32, name.length * PILL_CHAR_W + PILL_PADDING_X)
}

type Slot =
  | { kind: 'object'; objectId: string }
  | { kind: 'terminator'; ownerId: string; field: string }
  | { kind: 'null-variable'; frameIndex: number; name: string }

interface Pill {
  name: string
  frameIndex: number
}

const slotId = (slot: Slot): string =>
  slot.kind === 'object'
    ? `obj:${slot.objectId}`
    : slot.kind === 'terminator'
      ? `null:${slot.ownerId}.${slot.field}`
      : `nullvar:${slot.frameIndex}:${slot.name}`

/** The field a row follows: Node.next or BigNum.myHead. */
function linkField(object: HeapObject) {
  const name = object.type === 'BigNum' ? 'myHead' : 'next'
  return object.fields.find((f) => f.name === name)
}

function refDisplay(value: Value | undefined): RefDisplay {
  if (!value || value.kind === 'unspecified') return 'unspecified'
  return value.kind === 'ref' && value.target !== null ? 'ref' : 'null'
}

function intDisplay(value: Value | undefined): string {
  return value && value.kind === 'int' ? String(value.value) : '?'
}

export function layout(state: ProgramState): VizLayout {
  const objects = new Map(state.heap.map((o) => [o.id, o]))
  const reachable = reachableObjectIds(state)
  const placed = new Set<string>()
  const objectRows: Slot[][] = []
  const nullVariableRow: Slot[] = []
  const unreachableRow: Slot[] = []
  const pills = new Map<string, Pill[]>()
  const scalars: VizScalar[] = []

  const addPill = (targetSlotId: string, pill: Pill) => {
    pills.set(targetSlotId, [...(pills.get(targetSlotId) ?? []), pill])
  }

  /** Places `startId` and the objects its link field leads to, until null or an already-placed object. */
  const walk = (startId: string, row: Slot[]) => {
    let id: string | null = startId
    while (id !== null && !placed.has(id) && objects.has(id)) {
      const object: HeapObject = objects.get(id)!
      placed.add(id)
      row.push({ kind: 'object', objectId: id })
      const link = linkField(object)
      id = null
      if (link?.value.kind === 'ref') {
        if (link.value.target === null) row.push({ kind: 'terminator', ownerId: object.id, field: link.name })
        else id = link.value.target
      }
    }
  }

  state.frames.forEach((frame, frameIndex) => {
    for (const variable of frame.variables) {
      const value = variable.value
      if (value.kind === 'ref' && value.target !== null && objects.has(value.target)) {
        if (!placed.has(value.target)) {
          const row: Slot[] = []
          objectRows.push(row)
          walk(value.target, row)
        }
        addPill(`obj:${value.target}`, { name: variable.name, frameIndex })
      } else if (value.kind === 'ref' && value.target === null) {
        const slot: Slot = { kind: 'null-variable', frameIndex, name: variable.name }
        nullVariableRow.push(slot)
        addPill(slotId(slot), { name: variable.name, frameIndex })
      } else if (value.kind === 'int' || value.kind === 'unspecified') {
        scalars.push({
          name: variable.name,
          frameIndex,
          display: value.kind === 'int' ? String(value.value) : '?',
          unspecified: value.kind === 'unspecified',
        })
      }
    }
  })

  for (const object of state.heap) {
    if (!placed.has(object.id)) walk(object.id, unreachableRow)
  }

  const rows = [...objectRows, nullVariableRow, unreachableRow].filter((row) => row.length > 0)

  // Positions.
  const boxes: VizBox[] = []
  let top = 0
  let width = 0
  for (const row of rows) {
    const hasPills = row.some((slot) => pills.has(slotId(slot)))
    const band = hasPills ? PILL_H + PILL_ARROW : 0
    const hasObjects = row.some((slot) => slot.kind === 'object')
    const contentH = hasObjects ? OBJECT_H : NULL_H
    let x = 0

    for (const slot of row) {
      const id = slotId(slot)
      const slotPills = pills.get(id) ?? []
      const pillsW = slotPills.reduce((sum, p) => sum + pillWidth(p.name), 0) + PILL_GAP_X * Math.max(0, slotPills.length - 1)
      const boxW = slot.kind === 'object' ? (objects.get(slot.objectId)!.type === 'BigNum' ? BIGNUM_W : NODE_W) : NULL_W
      const slotW = Math.max(boxW, pillsW)
      const boxX = x + (slotW - boxW) / 2
      const objectsTop = top + band

      let px = x + (slotW - pillsW) / 2
      for (const pill of slotPills) {
        const w = pillWidth(pill.name)
        boxes.push({ kind: 'variable', id: `var:${pill.frameIndex}:${pill.name}`, name: pill.name, frameIndex: pill.frameIndex, x: px, y: top, w, h: PILL_H })
        px += w + PILL_GAP_X
      }

      if (slot.kind === 'object') {
        const object = objects.get(slot.objectId)!
        const unreachable = !reachable.has(object.id)
        if (object.type === 'BigNum') {
          boxes.push({
            kind: 'bignum',
            id,
            objectId: object.id,
            x: boxX,
            y: objectsTop,
            w: BIGNUM_W,
            h: OBJECT_H,
            myHead: refDisplay(object.fields.find((f) => f.name === 'myHead')?.value),
            mySize: intDisplay(object.fields.find((f) => f.name === 'mySize')?.value),
            unreachable,
          })
        } else {
          const [first, next] = object.fields
          boxes.push({
            kind: 'node',
            id,
            objectId: object.id,
            x: boxX,
            y: objectsTop,
            w: NODE_W,
            h: OBJECT_H,
            fieldName: first?.name ?? '',
            value: intDisplay(first?.value),
            next: refDisplay(next?.value),
            unreachable,
          })
        }
      } else {
        // Null markers line up with the cells of the objects on their row.
        const y = hasObjects ? objectsTop + CELL_CENTER_Y - NULL_H / 2 : objectsTop
        boxes.push({ kind: 'null', id, x: boxX, y, w: NULL_W, h: NULL_H })
      }
      x += slotW + COL_GAP
    }
    width = Math.max(width, x - COL_GAP)
    top += band + contentH + ROW_GAP
  }
  const height = rows.length > 0 ? top - ROW_GAP : 0

  // Edges: link fields first (in placement order), then variables.
  const edges: VizEdge[] = []
  for (const row of rows) {
    for (const slot of row) {
      if (slot.kind !== 'object') continue
      const object = objects.get(slot.objectId)!
      const link = linkField(object)
      if (!link || link.value.kind !== 'ref') continue
      const kind = object.type === 'BigNum' ? 'myHead' : 'next'
      const target = link.value.target === null ? `null:${object.id}.${link.name}` : `obj:${link.value.target}`
      edges.push({ id: `${kind}:${object.id}`, kind, source: `obj:${object.id}`, sourceHandle: kind, target, targetHandle: 'left' })
    }
  }
  state.frames.forEach((frame, frameIndex) => {
    for (const variable of frame.variables) {
      const value = variable.value
      if (value.kind !== 'ref') continue
      if (value.target !== null && !objects.has(value.target)) continue
      const target = value.target === null ? `nullvar:${frameIndex}:${variable.name}` : `obj:${value.target}`
      edges.push({
        id: `ref:${frameIndex}:${variable.name}`,
        kind: 'variable',
        source: `var:${frameIndex}:${variable.name}`,
        sourceHandle: 'ref',
        target,
        targetHandle: 'top',
      })
    }
  })

  return { boxes, edges, scalars, width, height }
}

/** Zoom that fits `l` into a width × height panel (with padding), never above 1. */
export function fitScale(l: VizLayout, width: number, height: number): number {
  if (l.width === 0 || l.height === 0) return 1
  return Math.min(1, (width - 2 * FIT_PADDING) / l.width, (height - 2 * FIT_PADDING) / l.height)
}
