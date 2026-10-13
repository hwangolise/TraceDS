// Hand-written 3-checkpoint exercise for engine and validation tests
// (docs/TESTING.md §3). Engine tests depend on this fixture, not on real content.
//
// It uses the BigNum terminology set so it can include an `unspecified` value
// (V16). Checkpoint 2 leaves the state unchanged (E18).
//
// Golden path: b, a, d.

import type { Exercise, ProgramState } from '../../src/engine/types'

const state0: ProgramState = {
  frames: [{ method: 'main', variables: [{ name: 'copy', value: { kind: 'ref', target: 'Y' } }] }],
  heap: [
    {
      id: 'Y',
      type: 'BigNum',
      fields: [
        { name: 'myHead', value: { kind: 'unspecified' } },
        { name: 'mySize', value: { kind: 'int', value: 2 } },
      ],
    },
  ],
  output: [],
}

const state1: ProgramState = {
  frames: [{ method: 'main', variables: [{ name: 'copy', value: { kind: 'ref', target: 'Y' } }] }],
  heap: [
    {
      id: 'Y',
      type: 'BigNum',
      fields: [
        { name: 'myHead', value: { kind: 'ref', target: 'D' } },
        { name: 'mySize', value: { kind: 'int', value: 2 } },
      ],
    },
    {
      id: 'D',
      type: 'Node',
      fields: [
        { name: 'digit', value: { kind: 'int', value: 4 } },
        { name: 'next', value: { kind: 'ref', target: null } },
      ],
    },
  ],
  output: [],
}

const state3: ProgramState = {
  frames: [{ method: 'main', variables: [{ name: 'copy', value: { kind: 'ref', target: 'Y' } }] }],
  heap: [
    {
      id: 'Y',
      type: 'BigNum',
      fields: [
        { name: 'myHead', value: { kind: 'ref', target: 'D' } },
        { name: 'mySize', value: { kind: 'int', value: 2 } },
      ],
    },
    {
      id: 'D',
      type: 'Node',
      fields: [
        { name: 'digit', value: { kind: 'int', value: 4 } },
        { name: 'next', value: { kind: 'ref', target: 'E' } },
      ],
    },
    {
      id: 'E',
      type: 'Node',
      fields: [
        { name: 'digit', value: { kind: 'int', value: 7 } },
        { name: 'next', value: { kind: 'ref', target: null } },
      ],
    },
  ],
  output: [],
}

export const GOLDEN_PATH = ['b', 'a', 'd'] as const

/** Returns a fresh, independent copy each call so tests can mutate it freely. */
export function makeMiniExercise(): Exercise {
  return structuredClone(miniExercise)
}

export const miniExercise: Exercise = {
  id: 'MN-01',
  moduleId: 'linked-lists',
  title: 'Mini fixture',
  objective: 'Exercise the engine in tests.',
  code: [
    'BigNum copy = new BigNum();',
    'copy.myHead = new Node(4, null);',
    'if (copy.myHead != null) {',
    '    copy.myHead.next = new Node(7, null);',
    '}',
  ],
  terminology: 'bignum-node',
  visualization: 'linked-list',
  initialState: state0,
  checkpoints: [
    {
      id: 'mn01-c1',
      lines: [2],
      concept: 'deep-copy',
      question: 'After line 2, what does copy.myHead refer to?',
      choices: [
        {
          id: 'a',
          text: 'An existing node shared with another list.',
          misconception: { id: 'shallow-head', hint: 'Hint for shallow-head.' },
        },
        { id: 'b', text: 'A new node containing 4, whose next is null.' },
        {
          id: 'c',
          text: 'A new node containing 4, followed by a copy of 7.',
          misconception: { id: 'new-copies-list', hint: 'Hint for new-copies-list.' },
        },
      ],
      correctChoiceId: 'b',
      resultState: state1,
      explanation: 'Explanation for mn01-c1.',
    },
    {
      id: 'mn01-c2',
      lines: [3],
      focus: 'copy.myHead != null',
      concept: 'null-references',
      question: 'The condition is evaluated. What happens?',
      choices: [
        { id: 'a', text: 'It is true, so the body runs.' },
        {
          id: 'b',
          text: 'It is false.',
          misconception: { id: 'implicit-this-field', hint: 'Hint for implicit-this-field.' },
        },
      ],
      correctChoiceId: 'a',
      resultState: state1,
      explanation: 'Explanation for mn01-c2.',
    },
    {
      id: 'mn01-c3',
      lines: [4],
      concept: 'linking-nodes',
      question: 'What does line 4 do?',
      choices: [
        {
          id: 'a',
          text: 'Overwrites the digit 4 with 7.',
          misconception: { id: 'field-confusion', hint: 'Hint for field-confusion.' },
        },
        {
          id: 'b',
          text: 'Links 4 to 7 and 7 back to 4.',
          misconception: { id: 'links-bidirectional', hint: 'Hint for links-bidirectional.' },
        },
        {
          id: 'c',
          text: 'Makes copy.myHead refer to the node containing 7.',
          misconception: { id: 'field-assign-moves-variable', hint: 'Hint for field-assign-moves-variable.' },
        },
        { id: 'd', text: 'Creates a node containing 7 and links it after the node containing 4.' },
      ],
      correctChoiceId: 'd',
      resultState: state3,
      explanation: 'Explanation for mn01-c3.',
    },
  ],
}
