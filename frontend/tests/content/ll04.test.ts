// LL-04 BigNum deep copy: named cases and deep-copy semantics
// (docs/EXERCISES.md LL-04, docs/TESTING.md §M4 C5, C8, C9, C11, C12).
// Expected code, states, and strings are typed here by hand.

import { describe, expect, it } from 'vitest'
import { ll04 } from '../../src/content/ll04'
import { continueRun, startRun, submitAnswer } from '../../src/engine/engine'
import type { ExerciseRun, HeapObject, ProgramState } from '../../src/engine/types'

const GOLDEN = ['c', 'b', 'd', 'a', 'b', 'c', 'a', 'c']

function at(index: number): ExerciseRun {
  let run = startRun(ll04)
  for (let i = 0; i < index; i++) run = continueRun(ll04, submitAnswer(ll04, run, GOLDEN[i]).run)
  return run
}

const obj = (s: ProgramState, id: string): HeapObject => s.heap.find((o) => o.id === id)!
const field = (s: ProgramState, id: string, name: string) => obj(s, id).fields.find((f) => f.name === name)!.value
const variable = (s: ProgramState, name: string) => s.frames[0].variables.find((v) => v.name === name)?.value
const after = (n: number) => ll04.checkpoints[n - 1].resultState

/** Node ids reachable from a BigNum's myHead, in list order. */
function listFrom(s: ProgramState, bigNumId: string): string[] {
  const ids: string[] = []
  let v = field(s, bigNumId, 'myHead')
  while (v.kind === 'ref' && v.target !== null && !ids.includes(v.target)) {
    ids.push(v.target)
    v = field(s, v.target, 'next')
  }
  return ids
}
const digits = (s: ProgramState, ids: string[]) => ids.map((id) => (field(s, id, 'digit') as { value: number }).value)

describe('LL-04 course code (C11)', () => {
  it("is the course's clone() verbatim", () => {
    expect(ll04.code).toEqual([
      'public BigNum clone() {',
      '    BigNum copy = new BigNum();',
      '    copy.mySize = mySize;',
      '',
      '    if (myHead != null) {',
      '        copy.myHead = new Node(myHead.digit, null);',
      '',
      '        Node newPtr = copy.myHead;',
      '',
      '        for (Node origPtr = myHead.next;',
      '             origPtr != null;',
      '             origPtr = origPtr.next) {',
      '',
      '            newPtr.next = new Node(origPtr.digit, null);',
      '            newPtr = newPtr.next;',
      '        }',
      '    }',
      '',
      '    return copy;',
      '}',
    ])
  })
})

describe('LL-04 states: mySize, myHead, newPtr, origPtr', () => {
  it('starts inside clone() with this → a BigNum holding 4, 7, 2', () => {
    const s = ll04.initialState
    expect(s.frames).toEqual([{ method: 'clone()', variables: [{ name: 'this', value: { kind: 'ref', target: 'X' } }] }])
    expect(digits(s, listFrom(s, 'X'))).toEqual([4, 7, 2])
    expect(field(s, 'X', 'mySize')).toEqual({ kind: 'int', value: 3 })
  })

  it('c1: copy is a new BigNum; mySize is copied; myHead is unspecified (A2)', () => {
    const s = after(1)
    expect(variable(s, 'copy')).toEqual({ kind: 'ref', target: 'Y' })
    expect(field(s, 'Y', 'mySize')).toEqual({ kind: 'int', value: 3 })
    expect(field(s, 'Y', 'myHead')).toEqual({ kind: 'unspecified' })
  })

  it('c2: the myHead != null check changes nothing; myHead is still unspecified (C12)', () => {
    expect(after(2)).toEqual(after(1))
    expect(field(after(2), 'Y', 'myHead')).toEqual({ kind: 'unspecified' })
  })

  it('c3: copy.myHead is a NEW node with the same digit, not the original node', () => {
    const s = after(3)
    const copyHead = field(s, 'Y', 'myHead')
    expect(copyHead).toEqual({ kind: 'ref', target: 'D' })
    expect(copyHead).not.toEqual(field(s, 'X', 'myHead'))
    expect(field(s, 'D', 'digit')).toEqual(field(s, 'A', 'digit'))
    expect(field(s, 'D', 'next')).toEqual({ kind: 'ref', target: null })
  })

  it('c4: newPtr builds the copy (copy head); origPtr walks the original (second node)', () => {
    const s = after(4)
    expect(variable(s, 'newPtr')).toEqual({ kind: 'ref', target: 'D' })
    expect(variable(s, 'origPtr')).toEqual({ kind: 'ref', target: 'B' })
  })

  it('c5: each loop pass allocates a new node; the original list is untouched', () => {
    const s = after(5)
    expect(digits(s, listFrom(s, 'Y'))).toEqual([4, 7])
    expect(listFrom(s, 'Y')).toEqual(['D', 'E'])
    expect(s.heap.filter((o) => ['A', 'B', 'C', 'X'].includes(o.id))).toEqual(after(4).heap.filter((o) => ['A', 'B', 'C', 'X'].includes(o.id)))
  })

  it('c6: newPtr stays on the copy, origPtr one node ahead in the original', () => {
    const s = after(6)
    expect(variable(s, 'newPtr')).toEqual({ kind: 'ref', target: 'E' })
    expect(variable(s, 'origPtr')).toEqual({ kind: 'ref', target: 'C' })
  })

  it('c7: the last digit is copied and origPtr becomes null', () => {
    const s = after(7)
    expect(digits(s, listFrom(s, 'Y'))).toEqual([4, 7, 2])
    expect(variable(s, 'origPtr')).toEqual({ kind: 'ref', target: null })
    expect(variable(s, 'newPtr')).toEqual({ kind: 'ref', target: 'F' })
  })

  it('c8: newPtr and origPtr are out of scope; this and copy remain', () => {
    expect(after(8).frames[0].variables.map((v) => v.name)).toEqual(['this', 'copy'])
  })

  it('C8 deep-copy invariant: disjoint node sets with equal digit sequences', () => {
    const s = after(8)
    const original = listFrom(s, 'X')
    const copy = listFrom(s, 'Y')
    expect(original).toHaveLength(3)
    expect(copy).toHaveLength(3)
    expect(original.filter((id) => copy.includes(id))).toEqual([])
    expect(digits(s, copy)).toEqual(digits(s, original))
    expect(s.heap.filter((o) => o.type === 'BigNum')).toHaveLength(2)
    expect(s.heap.filter((o) => o.type === 'Node')).toHaveLength(6)
  })
})

describe('LL-04 makes no unsupported claims (C12)', () => {
  it('never mentions digit significance, empty BigNums, or the number the digits form', () => {
    const strings = [
      ll04.title,
      ll04.objective,
      ...ll04.checkpoints.flatMap((c) => [c.question, c.explanation, ...c.choices.flatMap((ch) => [ch.text, ch.misconception?.hint ?? ''])]),
    ]
    expect(strings.length).toBeGreaterThan(10)
    for (const s of strings) {
      expect(s).not.toMatch(/most significant|least significant|empty BigNum/i)
      expect(s).not.toMatch(/\b(472|274|427|724|247|742)\b/)
    }
  })
})

describe('LL-04 named cases', () => {
  it('C9 ll04-c3 choice a → shallow-head (the headline misconception)', () => {
    const { run, outcome } = submitAnswer(ll04, at(2), 'a')
    expect(outcome).toMatchObject({ type: 'incorrect', checkpointId: 'll04-c3', misconceptionId: 'shallow-head' })
    expect(run.feedback).toMatchObject({
      hint:
        'If copy.myHead referred to the original node, the two BigNums would share nodes, and changing a digit in copy would change the original too. What does the `new` on line 6 create?',
    })
    expect(run.state).toEqual(after(2))
  })

  it('ll04-c2 choice a → implicit-this-field', () => {
    expect(submitAnswer(ll04, at(1), 'a').outcome).toMatchObject({ checkpointId: 'll04-c2', misconceptionId: 'implicit-this-field' })
  })

  it('ll04-c5 choice a → shallow-link', () => {
    expect(submitAnswer(ll04, at(4), 'a').outcome).toMatchObject({ checkpointId: 'll04-c5', misconceptionId: 'shallow-link' })
  })

  it('ll04-c8 choice b → shallow-copy', () => {
    expect(submitAnswer(ll04, at(7), 'b').outcome).toMatchObject({ checkpointId: 'll04-c8', misconceptionId: 'shallow-copy' })
  })

  it('ll04-c7 choice b → checks-next-not-cur (shared with LL-02)', () => {
    expect(submitAnswer(ll04, at(6), 'b').outcome).toMatchObject({ checkpointId: 'll04-c7', misconceptionId: 'checks-next-not-cur' })
  })
})
