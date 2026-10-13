// LL-03 named cases and mutation semantics (docs/EXERCISES.md LL-03,
// docs/TESTING.md §M4 C5, C10). Expected states and strings are typed here by
// hand, independently of the content file.

import { describe, expect, it } from 'vitest'
import { ll03 } from '../../src/content/ll03'
import { continueRun, startRun, submitAnswer } from '../../src/engine/engine'
import type { ExerciseRun } from '../../src/engine/types'
import { reachableObjectIds } from '../../src/viz/reachability'
import { makeState, node } from '../fixtures/states'

const GOLDEN = ['c', 'a', 'b', 'd']

function at(index: number): ExerciseRun {
  let run = startRun(ll03)
  for (let i = 0; i < index; i++) run = continueRun(ll03, submitAnswer(ll03, run, GOLDEN[i]).run)
  return run
}

describe('LL-03 code and initial state', () => {
  it('uses only head and prev, with one-statement insertion (decision A6)', () => {
    expect(ll03.code.filter((l) => l.trim() && !l.trim().startsWith('//'))).toEqual([
      'prev.next = new Node(5, prev.next);',
      'prev = prev.next;',
      'prev.next = prev.next.next;',
      'head = new Node(1, head);',
    ])
    expect(ll03.code.join('\n')).not.toMatch(/\b(temp|newNode|current)\b/)
  })

  it('starts with the sorted list 2 → 6 → 9 and prev on the node containing 2', () => {
    expect(ll03.initialState).toEqual(
      makeState({ head: 'A', prev: 'A' }, [node('A', 2, 'B'), node('B', 6, 'C'), node('C', 9, null)]),
    )
  })
})

describe('LL-03 resulting states', () => {
  it('c1 insertion: a new node containing 5 is linked after 2, before 6', () => {
    expect(ll03.checkpoints[0].resultState).toEqual(
      makeState({ head: 'A', prev: 'A' }, [node('A', 2, 'D'), node('B', 6, 'C'), node('C', 9, null), node('D', 5, 'B')]),
    )
  })

  it('c2 reference movement: only prev changes; every next field is unchanged', () => {
    const before = ll03.checkpoints[0].resultState
    const after = ll03.checkpoints[1].resultState
    expect(after.heap).toEqual(before.heap)
    expect(after.frames[0].variables).toEqual([
      { name: 'head', value: { kind: 'ref', target: 'A' } },
      { name: 'prev', value: { kind: 'ref', target: 'D' } },
    ])
  })

  it('c3 deletion/bypass: the node after prev is skipped and becomes unreachable (C10)', () => {
    const state = ll03.checkpoints[2].resultState
    expect(state).toEqual(
      makeState({ head: 'A', prev: 'D' }, [node('A', 2, 'D'), node('B', 6, 'C'), node('C', 9, null), node('D', 5, 'C')]),
    )
    expect([...reachableObjectIds(state)].sort()).toEqual(['A', 'C', 'D'])
  })

  it('c4 front insertion updates head; the unreachable node is gone from the heap (C10)', () => {
    const state = ll03.checkpoints[3].resultState
    expect(state).toEqual(
      makeState({ head: 'E', prev: 'D' }, [node('E', 1, 'A'), node('A', 2, 'D'), node('D', 5, 'C'), node('C', 9, null)]),
    )
    expect(state.heap.map((o) => o.id)).not.toContain('B')
  })
})

describe('LL-03 named cases', () => {
  it('ll03-c1 choice a → rest-lost', () => {
    const { run, outcome } = submitAnswer(ll03, at(0), 'a')
    expect(outcome).toMatchObject({ type: 'incorrect', checkpointId: 'll03-c1', misconceptionId: 'rest-lost' })
    expect(run.feedback).toMatchObject({
      hint: 'Java evaluates the right side first. `new Node(5, prev.next)` reads prev.next *before* it is overwritten. What did prev.next refer to at that moment?',
    })
  })

  it('ll03-c3 choice a → next-next-removed', () => {
    expect(submitAnswer(ll03, at(2), 'a').outcome).toMatchObject({ checkpointId: 'll03-c3', misconceptionId: 'next-next-removed' })
  })

  it('ll03-c4 choice b → rhs-evaluated-after', () => {
    expect(submitAnswer(ll03, at(3), 'b').outcome).toMatchObject({ checkpointId: 'll03-c4', misconceptionId: 'rhs-evaluated-after' })
  })

  it('ll03-c4: a, b, c, then d → attempt 4 and three hints', () => {
    let run = at(3)
    for (const wrong of ['a', 'b', 'c']) run = submitAnswer(ll03, run, wrong).run
    const { run: done, outcome } = submitAnswer(ll03, run, 'd')
    expect(outcome).toMatchObject({ type: 'correct', attempt: 4, exerciseCompleted: true })
    expect(done.results[3].hintsShown).toEqual(['front-insert-appends', 'rhs-evaluated-after', 'head-not-updated'])
  })
})
