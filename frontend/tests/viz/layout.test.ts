// M2 layout tests L1–L18 (docs/TESTING.md §M2, docs/ARCHITECTURE.md §6.2).

import { describe, expect, it } from 'vitest'
import { fitScale, layout, MIN_SCALE } from '../../src/viz/layout'
import { reachableObjectIds } from '../../src/viz/reachability'
import { diff } from '../../src/viz/diff'
import type { BigNumBox, NodeBox, VariableBox, VizBox, VizLayout } from '../../src/viz/types'
import { bigNum, deepFreeze, docState, docStates, makeState, node, ref, unspecified } from '../fixtures/states'

const objectBox = (l: VizLayout, objectId: string) =>
  l.boxes.find((b) => (b.kind === 'node' || b.kind === 'bignum') && b.objectId === objectId) as NodeBox | BigNumBox
const pill = (l: VizLayout, name: string) =>
  l.boxes.find((b) => b.kind === 'variable' && b.name === name) as VariableBox | undefined
const nulls = (l: VizLayout) => l.boxes.filter((b) => b.kind === 'null')
const edgesInto = (l: VizLayout, target: string) => l.edges.filter((e) => e.target === target)

function overlaps(a: VizBox, b: VizBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** True if `upper` sits fully above `lower` and they share some horizontal span. */
function isAbove(upper: VizBox, lower: VizBox): boolean {
  return upper.y + upper.h <= lower.y && upper.x < lower.x + lower.w && lower.x < upper.x + upper.w
}

describe('layout', () => {
  it('L1 empty state: no boxes, no edges', () => {
    const l = layout(deepFreeze(makeState({}, [])))
    expect(l.boxes).toEqual([])
    expect(l.edges).toEqual([])
    expect(l.scalars).toEqual([])
  })

  it('L2 head → null: a pill, its own null marker, and an edge between them', () => {
    const l = layout(deepFreeze(makeState({ head: null }, [])))
    const head = pill(l, 'head')!
    expect(head).toBeDefined()
    expect(nulls(l)).toHaveLength(1)
    const marker = nulls(l)[0]
    expect(isAbove(head, marker)).toBe(true)
    expect(l.edges).toEqual([
      expect.objectContaining({ kind: 'variable', source: head.id, sourceHandle: 'ref', target: marker.id, targetHandle: 'top' }),
    ])
  })

  it('L3 one-node list: [4 | next] → null terminator, head above it', () => {
    const l = layout(deepFreeze(makeState({ head: 'A' }, [node('A', 4, null)])))
    const a = objectBox(l, 'A') as NodeBox
    expect(a).toMatchObject({ kind: 'node', fieldName: 'data', value: '4', next: 'null', unreachable: false })
    const [terminator] = nulls(l)
    expect(terminator.x).toBeGreaterThanOrEqual(a.x + a.w)
    expect(l.edges).toContainEqual(
      expect.objectContaining({ kind: 'next', source: a.id, sourceHandle: 'next', target: terminator.id, targetHandle: 'left' }),
    )
    expect(isAbove(pill(l, 'head')!, a)).toBe(true)
  })

  it('L4 multiple-node list: list order left to right on one row, ending in null', () => {
    const l = layout(deepFreeze(makeState({ head: 'A' }, [node('A', 3, 'B'), node('B', 8, 'C'), node('C', 5, null)])))
    const [a, b, c] = ['A', 'B', 'C'].map((id) => objectBox(l, id))
    expect(new Set([a.y, b.y, c.y]).size).toBe(1)
    expect(a.x).toBeLessThan(b.x)
    expect(b.x).toBeLessThan(c.x)
    const terminator = nulls(l)[0]
    expect(terminator.x).toBeGreaterThan(c.x)
    expect(l.edges.filter((e) => e.kind === 'next').map((e) => [e.source, e.target])).toEqual([
      [a.id, b.id],
      [b.id, c.id],
      [c.id, terminator.id],
    ])
  })

  it('L5 every next reference produces exactly one edge from the next handle', () => {
    const state = docState('ll01-c6')
    const l = layout(state)
    const nextEdges = l.edges.filter((e) => e.kind === 'next')
    const nodes = state.heap.filter((o) => o.type === 'Node')
    expect(nextEdges).toHaveLength(nodes.length)
    for (const n of nodes) {
      const out = nextEdges.filter((e) => e.source === `obj:${n.id}`)
      expect(out).toHaveLength(1)
      expect(out[0].sourceHandle).toBe('next')
    }
    // No other edge kinds than next and variable references.
    expect(l.edges.every((e) => e.kind === 'next' || e.kind === 'variable')).toBe(true)
    expect(l.edges.filter((e) => e.kind === 'variable')).toHaveLength(2)
  })

  it('L6 head reference: pill above the first node with an edge to it', () => {
    const l = layout(docState('ll01-c2'))
    const head = pill(l, 'head')!
    const a = objectBox(l, 'A')
    expect(isAbove(head, a)).toBe(true)
    expect(l.edges).toContainEqual(
      expect.objectContaining({ kind: 'variable', source: head.id, target: a.id, targetHandle: 'top' }),
    )
  })

  it('L7 temporary reference: cur over a middle node; the list is unchanged', () => {
    const withCur = layout(docState('ll02-c3')) // head → A, cur → B
    const withoutCur = layout(makeState({ head: 'A' }, docState('ll02-c3').heap, ['3']))
    const b = objectBox(withCur, 'B')
    expect(isAbove(pill(withCur, 'cur')!, b)).toBe(true)
    expect(edgesInto(withCur, b.id)).toContainEqual(expect.objectContaining({ kind: 'variable', source: pill(withCur, 'cur')!.id }))
    for (const id of ['A', 'B', 'C']) {
      expect(objectBox(withCur, id).y).toBe(objectBox(withCur, 'A').y)
    }
    expect(withCur.edges.filter((e) => e.kind === 'next')).toEqual(withoutCur.edges.filter((e) => e.kind === 'next'))
  })

  it('L8 multiple references to one node: separate pills, no overlap, each with its own edge', () => {
    const l = layout(docState('ll01-c3')) // head → A, cur → A
    const head = pill(l, 'head')!
    const cur = pill(l, 'cur')!
    const a = objectBox(l, 'A')
    expect(overlaps(head, cur)).toBe(false)
    expect(isAbove(head, a)).toBe(true)
    expect(isAbove(cur, a)).toBe(true)
    const into = edgesInto(l, a.id).filter((e) => e.kind === 'variable').map((e) => e.source)
    expect(into.sort()).toEqual([cur.id, head.id].sort())
  })

  it('L9 two next fields into one node: two edges into it, second referrer on its own row', () => {
    const l = layout(makeState({ head: 'A', cur: 'D' }, [node('A', 2, 'B'), node('B', 6, null), node('D', 5, 'B')]))
    const b = objectBox(l, 'B')
    const into = edgesInto(l, b.id).filter((e) => e.kind === 'next').map((e) => e.source)
    expect(into.sort()).toEqual(['obj:A', 'obj:D'])
    expect(objectBox(l, 'D').y).toBeGreaterThan(objectBox(l, 'A').y)
  })

  it('L10 unreachable node is flagged and placed on the last row (LL-03 after c3)', () => {
    const state = docState('ll03-c3')
    expect([...reachableObjectIds(state)].sort()).toEqual(['A', 'C', 'D'])
    const l = layout(state)
    const b = objectBox(l, 'B') as NodeBox
    expect(b.unreachable).toBe(true)
    for (const id of ['A', 'C', 'D']) expect((objectBox(l, id) as NodeBox).unreachable).toBe(false)
    const maxObjectY = Math.max(...l.boxes.filter((x) => x.kind === 'node').map((x) => x.y))
    expect(b.y).toBe(maxObjectY)
    expect(b.y).toBeGreaterThan(objectBox(l, 'A').y)
    // Its outgoing next reference is still drawn.
    expect(l.edges).toContainEqual(expect.objectContaining({ kind: 'next', source: b.id, target: 'obj:C' }))
  })

  it('L11 BigNum object: box with myHead and mySize; myHead → null gets a null marker', () => {
    const l = layout(docState('ll04-initial'))
    expect(objectBox(l, 'X')).toMatchObject({ kind: 'bignum', myHead: 'ref', mySize: '3' })
    expect(l.edges).toContainEqual(
      expect.objectContaining({ kind: 'myHead', source: 'obj:X', sourceHandle: 'myHead', target: 'obj:A', targetHandle: 'left' }),
    )

    const empty = layout(makeState({ copy: 'Y' }, [bigNum('Y', ref(null), 0)]))
    expect(objectBox(empty, 'Y')).toMatchObject({ kind: 'bignum', myHead: 'null' })
    expect(nulls(empty)).toHaveLength(1)
    expect(empty.edges).toContainEqual(
      expect.objectContaining({ kind: 'myHead', source: 'obj:Y', target: nulls(empty)[0].id }),
    )
  })

  it('L12 deep copy: original and copy on separate rows, no edge from copy into original', () => {
    const l = layout(docState('ll04-c8'))
    const original = ['X', 'A', 'B', 'C'].map((id) => objectBox(l, id))
    const copy = ['Y', 'D', 'E', 'F'].map((id) => objectBox(l, id))
    expect(new Set(original.map((b) => b.y + b.h / 2)).size).toBe(1)
    expect(new Set(copy.map((b) => b.y + b.h / 2)).size).toBe(1)
    expect(copy[0].y).toBeGreaterThan(original[0].y)
    const originalIds = new Set(original.map((b) => b.id))
    const copyIds = new Set(copy.map((b) => b.id))
    expect(l.edges.filter((e) => copyIds.has(e.source) && originalIds.has(e.target))).toEqual([])
  })

  it('L13 cycle safety: terminates and places each node once', () => {
    const l = layout(makeState({ head: 'A' }, [node('A', 1, 'B'), node('B', 2, 'A')]))
    expect(l.boxes.filter((b) => b.kind === 'node')).toHaveLength(2)
    expect(l.edges).toContainEqual(expect.objectContaining({ kind: 'next', source: 'obj:B', target: 'obj:A' }))
    expect(nulls(l)).toHaveLength(0)
  })

  it('L14 determinism: same state → deep-equal layout; the input is not mutated', () => {
    for (const [key, state] of docStates()) {
      const frozen = deepFreeze(structuredClone(state))
      expect(layout(frozen), key).toEqual(layout(structuredClone(state)))
    }
  })

  it('L15 a variable absent from the frame has no pill (LL-02 after c8)', () => {
    const l = layout(docState('ll02-c8'))
    expect(pill(l, 'cur')).toBeUndefined()
    expect(pill(l, 'head')).toBeDefined()
  })

  it('L16 field labels come from state: data for generic nodes, digit for BigNum nodes', () => {
    const generic = layout(docState('ll01-c6'))
    const bignum = layout(docState('ll04-c8'))
    const generics = generic.boxes.filter((b): b is NodeBox => b.kind === 'node')
    const digits = bignum.boxes.filter((b): b is NodeBox => b.kind === 'node')
    expect(generics.length).toBeGreaterThan(0)
    expect(digits.length).toBeGreaterThan(0)
    expect(generics.every((b) => b.fieldName === 'data')).toBe(true)
    expect(digits.every((b) => b.fieldName === 'digit')).toBe(true)
  })

  it('L17 unspecified reference: shown as "?", with no edge and no null marker (LL-04 after c1)', () => {
    const l = layout(docState('ll04-c1'))
    expect(objectBox(l, 'Y')).toMatchObject({ kind: 'bignum', myHead: 'unspecified' })
    expect(l.edges.filter((e) => e.source === 'obj:Y')).toEqual([])
    // The only null marker belongs to the original list's last node.
    expect(nulls(l)).toHaveLength(1)
    expect(l.edges).toContainEqual(expect.objectContaining({ source: 'obj:C', target: nulls(l)[0].id }))
    // When line 6 assigns it, the change is reported.
    expect(diff(docState('ll04-c2'), docState('ll04-c3')).fields).toContain('Y.myHead')
  })

  it('L17 unspecified and int variables are listed as scalars, never drawn as references', () => {
    const l = layout(makeState({ head: 'A', n: { kind: 'int', value: 3 }, x: unspecified }, [node('A', 1, null)]))
    expect(l.scalars).toEqual([
      { name: 'n', frameIndex: 0, display: '3', unspecified: false },
      { name: 'x', frameIndex: 0, display: '?', unspecified: true },
    ])
    expect(pill(l, 'n')).toBeUndefined()
    expect(pill(l, 'x')).toBeUndefined()
  })

  it('L18 every EXERCISES.md state lays out without overlap and fits a 600×400 panel legibly', () => {
    for (const [key, state] of docStates()) {
      const l = layout(state)
      for (let i = 0; i < l.boxes.length; i++) {
        const a = l.boxes[i]
        expect(a.x, `${key} ${a.id}`).toBeGreaterThanOrEqual(0)
        expect(a.y, `${key} ${a.id}`).toBeGreaterThanOrEqual(0)
        expect(a.x + a.w, `${key} ${a.id}`).toBeLessThanOrEqual(l.width)
        expect(a.y + a.h, `${key} ${a.id}`).toBeLessThanOrEqual(l.height)
        for (let j = i + 1; j < l.boxes.length; j++) {
          expect(overlaps(a, l.boxes[j]), `${key}: ${a.id} overlaps ${l.boxes[j].id}`).toBe(false)
        }
      }
      expect(fitScale(l, 600, 400), key).toBeGreaterThanOrEqual(MIN_SCALE)
    }
  })

  it('fitScale never zooms above 1 and shrinks to fit narrow panels', () => {
    const l = layout(docState('ll04-c8'))
    expect(fitScale(l, 10_000, 10_000)).toBe(1)
    expect(fitScale(l, 360, 400)).toBeLessThan(fitScale(l, 600, 400))
  })
})
