// C5 named cases for LL-02 (docs/EXERCISES.md "LL-02 wrong-answer tests").
// Expected strings are typed here by hand, independently of the content file.

import { describe, expect, it } from 'vitest'
import { ll02 } from '../../src/content/ll02'
import { continueRun, startRun, submitAnswer } from '../../src/engine/engine'
import type { ExerciseRun } from '../../src/engine/types'

function at(index: number): ExerciseRun {
  const golden = ['b', 'a', 'b', 'c', 'a', 'b', 'c', 'b']
  let run = startRun(ll02)
  for (let i = 0; i < index; i++) run = continueRun(ll02, submitAnswer(ll02, run, golden[i]).run)
  return run
}

describe('LL-02 named cases', () => {
  it('ll02-c6 choice a → checks-next-not-cur (off-by-one)', () => {
    const { run, outcome } = submitAnswer(ll02, at(5), 'a')
    expect(outcome).toMatchObject({ type: 'incorrect', checkpointId: 'll02-c6', misconceptionId: 'checks-next-not-cur' })
    expect(run.feedback).toMatchObject({
      hint: 'Read the condition carefully. It tests `cur != null`, not `cur.next != null`. Is cur itself null right now?',
    })
  })

  it('ll02-c7 choice b → null-read-throws', () => {
    expect(submitAnswer(ll02, at(6), 'b').outcome).toMatchObject({ checkpointId: 'll02-c7', misconceptionId: 'null-read-throws' })
  })

  it('ll02-c8 choice c → null-compare-throws', () => {
    expect(submitAnswer(ll02, at(7), 'c').outcome).toMatchObject({ checkpointId: 'll02-c8', misconceptionId: 'null-compare-throws' })
  })

  it('ll02-c7: a, b, d, then c → attempt 4 and three hints', () => {
    let run = at(6)
    for (const wrong of ['a', 'b', 'd']) run = submitAnswer(ll02, run, wrong).run
    const { run: after, outcome } = submitAnswer(ll02, run, 'c')
    expect(outcome).toMatchObject({ type: 'correct', attempt: 4 })
    expect(after.results[6].hintsShown).toEqual(['null-assign-fails', 'null-read-throws', 'wraps-to-head'])
  })

  it('uses the course traversal verbatim', () => {
    expect(ll02.code).toEqual([
      'for(Node cur = head; cur != null; cur = cur.next) {',
      '    System.out.println(cur.data);',
      '}',
    ])
    expect(ll02.checkpoints[7].resultState.frames[0].variables.map((v) => v.name)).toEqual(['head'])
  })
})
