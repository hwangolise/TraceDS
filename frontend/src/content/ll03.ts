// LL-03 — Linked List Mutation. Transcribed verbatim from docs/EXERCISES.md, which is
// authoritative. tests/content/ checks this file against the doc.

import type { Exercise } from '../engine/types'
import { frame, node, ref, v } from './build'

export const ll03: Exercise = {
  id: 'LL-03',
  moduleId: 'linked-lists',
  title: 'Linked List Mutation',
  objective: 'Reason about how insertion and deletion change references. Covers inserting after a node in one statement, moving a reference without changing the list, unlinking with `prev.next = prev.next.next`, unreachable nodes, and why inserting at the front must update head.',
  code: [
    '// prev refers to the node containing 2',
    'prev.next = new Node(5, prev.next);',
    '',
    '// Move prev forward one node',
    'prev = prev.next;',
    '',
    '// Remove the node after prev',
    'prev.next = prev.next.next;',
    '',
    '// Insert 1 at the front',
    'head = new Node(1, head);',
  ],
  terminology: 'generic-node',
  visualization: 'linked-list',
  initialState: {
    frames: [frame('main', [v('head', ref('A')), v('prev', ref('A'))])],
    heap: [
      node('A', 'data', 2, 'B'),
      node('B', 'data', 6, 'C'),
      node('C', 'data', 9, null),
    ],
    output: [],
  },
  checkpoints: [
    {
      id: 'll03-c1',
      lines: [2],
      concept: 'insertion',
      question: 'After line 2, which values are in the list starting at head?',
      choices: [
        {
          id: 'a',
          text: '2, 5',
          misconception: { id: 'rest-lost', hint: 'Java evaluates the right side first. `new Node(5, prev.next)` reads prev.next *before* it is overwritten. What did prev.next refer to at that moment?' },
        },
        {
          id: 'b',
          text: '5, 2, 6, 9',
          misconception: { id: 'insert-before', hint: 'head still refers to the node containing 2, because line 2 doesn\'t assign head. The new node goes into prev\'s next field, which is *after* prev\'s node.' },
        },
        { id: 'c', text: '2, 5, 6, 9' },
        {
          id: 'd',
          text: '2, 6, 9, 5',
          misconception: { id: 'auto-append', hint: 'A node\'s position depends only on which next fields refer to it. Which next field is assigned on line 2?' },
        },
      ],
      correctChoiceId: 'c',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('prev', ref('A'))])],
        heap: [
          node('A', 'data', 2, 'D'),
          node('B', 'data', 6, 'C'),
          node('C', 'data', 9, null),
          node('D', 'data', 5, 'B'),
        ],
        output: [],
      },
      explanation: 'The right side runs first. `new Node(5, prev.next)` creates a node whose next is the node containing 6. Then that new node is stored in prev.next. Because the rest of the list was passed to the constructor before prev.next changed, nothing is lost.',
    },
    {
      id: 'll03-c2',
      lines: [5],
      concept: 'temp-references',
      question: 'After line 5, which statement is true?',
      choices: [
        { id: 'a', text: 'prev refers to the node containing 5. The list is unchanged: 2, 5, 6, 9.' },
        {
          id: 'b',
          text: 'prev refers to the node containing 5, and the node containing 2 is removed from the list.',
          misconception: { id: 'moving-ref-mutates-list', hint: 'Line 5 assigns the variable prev only. No next field is assigned, so no link in the list changes.' },
        },
        {
          id: 'c',
          text: 'prev and head both refer to the node containing 5.',
          misconception: { id: 'alias-variables-linked', hint: 'head and prev referred to the same node, but they are separate variables. Line 5 assigns only to prev.' },
        },
      ],
      correctChoiceId: 'a',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('prev', ref('D'))])],
        heap: [
          node('A', 'data', 2, 'D'),
          node('B', 'data', 6, 'C'),
          node('C', 'data', 9, null),
          node('D', 'data', 5, 'B'),
        ],
        output: [],
      },
      explanation: 'prev moves one node forward. It now refers to the node just before the one we\'re about to remove, which is exactly what deletion in a singly linked list needs.',
    },
    {
      id: 'll03-c3',
      lines: [8],
      concept: 'deletion',
      question: 'Which node does line 8 remove from the list?',
      choices: [
        {
          id: 'a',
          text: 'The node containing 9. The list becomes 2, 5, 6.',
          misconception: { id: 'next-next-removed', hint: '`prev.next.next` is the node two steps after prev. It\'s the node being linked *to*. Which node does the new link skip over?' },
        },
        { id: 'b', text: 'The node containing 6. The list becomes 2, 5, 9.' },
        {
          id: 'c',
          text: 'The node containing 5. The list becomes 2, 6, 9.',
          misconception: { id: 'removes-self', hint: 'Line 8 assigns `prev.next`, the link going *out* of prev\'s node. prev\'s node stays where it is. Only what comes after it changes.' },
        },
      ],
      correctChoiceId: 'b',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('prev', ref('D'))])],
        heap: [
          node('A', 'data', 2, 'D'),
          node('B', 'data', 6, 'C'),
          node('C', 'data', 9, null),
          node('D', 'data', 5, 'C'),
        ],
        output: [],
      },
      explanation: 'prev\'s node now skips over the node containing 6. That node isn\'t destroyed by line 8, and its next field still refers to 9. But nothing refers to it any more, so it\'s unreachable, and Java\'s garbage collector will eventually reclaim it.',
    },
    {
      id: 'll03-c4',
      lines: [11],
      concept: 'insertion',
      question: 'After line 11, which values are in the list starting at head?',
      choices: [
        {
          id: 'a',
          text: '2, 5, 9, 1',
          misconception: { id: 'front-insert-appends', hint: 'The new node\'s next is set to the value of head, which is the node at the front. Where does that put the new node?' },
        },
        {
          id: 'b',
          text: '1',
          misconception: { id: 'rhs-evaluated-after', hint: 'Java evaluates the whole right side, including reading head, before it assigns to head. What did head refer to at that moment?' },
        },
        {
          id: 'c',
          text: '2, 5, 9. The node containing 1 is created, but head still refers to the node containing 2.',
          misconception: { id: 'head-not-updated', hint: 'Look at the left side of line 11. Which variable is assigned?' },
        },
        { id: 'd', text: '1, 2, 5, 9' },
      ],
      correctChoiceId: 'd',
      resultState: {
        frames: [frame('main', [v('head', ref('E')), v('prev', ref('D'))])],
        heap: [
          node('E', 'data', 1, 'A'),
          node('A', 'data', 2, 'D'),
          node('D', 'data', 5, 'C'),
          node('C', 'data', 9, null),
        ],
        output: [],
      },
      explanation: '`new Node(1, head)` reads head\'s current value, the node containing 2, and uses it as the new node\'s next. Then head is reassigned to the new node. Inserting at the front is the one insertion that must update head. It uses the same pattern as line 2: `new Node(value, <rest of list>)`.',
    },
  ],
}
