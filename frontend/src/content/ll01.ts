// LL-01 — References & Node Construction. Transcribed verbatim from docs/EXERCISES.md, which is
// authoritative. tests/content/ checks this file against the doc.

import type { Exercise } from '../engine/types'
import { frame, node, ref, v } from './build'

export const ll01: Exercise = {
  id: 'LL-01',
  moduleId: 'linked-lists',
  title: 'References & Node Construction',
  objective: 'Predict the memory state as `Node` objects are allocated with `new` and linked through `next`. Distinguish a reference from the object it refers to. Recognise that two variables can refer to the same node, and that changes made through either one change that node.',
  code: [
    'Node head = new Node(4);',
    'head.next = new Node(7);',
    'Node cur = head;',
    'cur = cur.next;',
    'cur.next = new Node(1, null);',
    'cur.data = 9;',
  ],
  terminology: 'generic-node',
  visualization: 'linked-list',
  initialState: {
    frames: [frame('main', [])],
    heap: [],
    output: [],
  },
  checkpoints: [
    {
      id: 'll01-c1',
      lines: [1],
      concept: 'dynamic-allocation',
      question: 'Line 1 runs. What does memory look like afterward?',
      choices: [
        {
          id: 'a',
          text: 'head holds the value 4 directly; no Node object is created.',
          misconception: { id: 'ref-holds-value', hint: 'head is declared with type Node, not int. A Node variable holds a reference to a Node object. What does `new Node(4)` produce?' },
        },
        { id: 'b', text: 'head refers to a new Node whose data is 4 and whose next is null.' },
        {
          id: 'c',
          text: 'head refers to a new Node with data 4, and its next refers to another new, empty Node.',
          misconception: { id: 'next-auto-allocated', hint: 'Count the `new` expressions on line 1. Each `new` creates exactly one object. What does the one-argument constructor set next to?' },
        },
        {
          id: 'd',
          text: 'A Node with data 4 is created, but head stays null until the node is linked into a list.',
          misconception: { id: 'assignment-deferred', hint: 'An assignment stores its right-hand value into the variable as soon as the statement runs. Nothing about linking is required first.' },
        },
      ],
      correctChoiceId: 'b',
      resultState: {
        frames: [frame('main', [v('head', ref('A'))])],
        heap: [
          node('A', 'data', 4, null),
        ],
        output: [],
      },
      explanation: '`new Node(4)` allocates one Node object. The one-argument constructor calls `this(4, null)`, so data is 4 and next is null. The `=` stores a reference to that new node in head.',
    },
    {
      id: 'll01-c2',
      lines: [2],
      concept: 'linking-nodes',
      question: 'What changes after line 2?',
      choices: [
        {
          id: 'a',
          text: 'head now refers to the node containing 7.',
          misconception: { id: 'field-assign-moves-variable', hint: 'The left side of the assignment is `head.next`, not `head`. Which one receives the new value, and which one is left alone?' },
        },
        {
          id: 'b',
          text: 'The data in head\'s node changes from 4 to 7.',
          misconception: { id: 'dot-overwrites-data', hint: '`head.next` names the next field of the node head refers to. The data field isn\'t mentioned on line 2.' },
        },
        { id: 'c', text: 'A new Node containing 7 is created, and the next field of the node containing 4 now refers to it. head is unchanged.' },
        {
          id: 'd',
          text: 'A new Node containing 7 is created, and its next refers back to the node containing 4.',
          misconception: { id: 'links-bidirectional', hint: 'One assignment changes exactly one field. In a singly linked list, links go one way. What does the one-argument constructor set the new node\'s next to?' },
        },
      ],
      correctChoiceId: 'c',
      resultState: {
        frames: [frame('main', [v('head', ref('A'))])],
        heap: [
          node('A', 'data', 4, 'B'),
          node('B', 'data', 7, null),
        ],
        output: [],
      },
      explanation: 'The right side runs first: `new Node(7)` creates a node with next = null. That reference is then stored in the next field of the node head refers to. head itself still refers to the node containing 4.',
    },
    {
      id: 'll01-c3',
      lines: [3],
      concept: 'aliasing',
      question: 'After line 3, how many Node objects exist, and what does cur refer to?',
      choices: [
        {
          id: 'a',
          text: '3 nodes: cur refers to a new copy of the node containing 4.',
          misconception: { id: 'assignment-copies-object', hint: 'Is there a `new` on line 3? Assigning one reference variable to another copies the reference, not the object.' },
        },
        {
          id: 'b',
          text: '2 nodes: cur refers to the variable head.',
          misconception: { id: 'ref-to-variable', hint: 'References point to objects, never to other variables. What object does head refer to at this moment?' },
        },
        {
          id: 'c',
          text: '2 nodes: the node moves to cur, so head becomes null.',
          misconception: { id: 'assignment-moves', hint: 'Assignment reads head\'s value and copies it into cur. Reading a variable never changes it.' },
        },
        { id: 'd', text: '2 nodes: head and cur both refer to the node containing 4.' },
      ],
      correctChoiceId: 'd',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('A'))])],
        heap: [
          node('A', 'data', 4, 'B'),
          node('B', 'data', 7, null),
        ],
        output: [],
      },
      explanation: '`cur = head` copies the reference stored in head. Now two variables refer to the same node. No new node is created.',
    },
    {
      id: 'll01-c4',
      lines: [4],
      concept: 'temp-references',
      question: 'After line 4, which statement is true?',
      choices: [
        { id: 'a', text: 'cur refers to the node containing 7. head still refers to the node containing 4.' },
        {
          id: 'b',
          text: 'Both cur and head now refer to the node containing 7.',
          misconception: { id: 'alias-variables-linked', hint: 'head and cur referred to the same node, but they are separate variables. Line 4 assigns only to cur.' },
        },
        {
          id: 'c',
          text: 'cur refers to the node containing 7, and the node containing 4 is removed from the list.',
          misconception: { id: 'moving-ref-mutates-list', hint: 'Line 4 assigns to the variable cur only. No next field is assigned, so no link in the list changes.' },
        },
      ],
      correctChoiceId: 'a',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('B'))])],
        heap: [
          node('A', 'data', 4, 'B'),
          node('B', 'data', 7, null),
        ],
        output: [],
      },
      explanation: '`cur.next` is read from the node cur refers to, giving the node containing 7. That reference is stored in cur. Moving a temporary reference doesn\'t change any node, and head is untouched.',
    },
    {
      id: 'll01-c5',
      lines: [5],
      concept: 'linking-nodes',
      question: 'What does line 5 do?',
      choices: [
        {
          id: 'a',
          text: 'Nothing in the list changes, because cur is only a temporary variable.',
          misconception: { id: 'temp-changes-dont-persist', hint: 'cur refers to a real node in the list. `cur.next` is that node\'s next field. Assigning to it changes the node itself, whichever variable you used to reach it.' },
        },
        {
          id: 'b',
          text: 'cur now refers to the new node containing 1.',
          misconception: { id: 'field-assign-moves-variable', hint: 'The left side is `cur.next`, not `cur`. Which one is assigned?' },
        },
        {
          id: 'c',
          text: 'The next field of the node containing 4 now refers to the new node.',
          misconception: { id: 'stale-position', hint: 'Where does cur refer after line 4? `cur.next` is the next field of *that* node.' },
        },
        { id: 'd', text: 'The node containing 7 now links to a new node containing 1. The list from head is 4 → 7 → 1 → null.' },
      ],
      correctChoiceId: 'd',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('B'))])],
        heap: [
          node('A', 'data', 4, 'B'),
          node('B', 'data', 7, 'C'),
          node('C', 'data', 1, null),
        ],
        output: [],
      },
      explanation: 'cur refers to the node containing 7, so `cur.next = …` changes that node\'s next field. Since the node is part of the list starting at head, the list now has three nodes.',
    },
    {
      id: 'll01-c6',
      lines: [6],
      concept: 'aliasing',
      question: 'Line 6 runs. If you traverse the list from head, which values are printed?',
      choices: [
        {
          id: 'a',
          text: '9, 7, 1',
          misconception: { id: 'stale-position', hint: 'Which node does cur refer to right now? Line 4 moved it.' },
        },
        {
          id: 'b',
          text: '4, 7, 1',
          misconception: { id: 'temp-changes-dont-persist', hint: 'cur and the list share the same Node objects. `cur.data = 9` changes the node cur refers to, and the list reaches that same node through `head.next`.' },
        },
        { id: 'c', text: '4, 9, 1' },
      ],
      correctChoiceId: 'c',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('B'))])],
        heap: [
          node('A', 'data', 4, 'B'),
          node('B', 'data', 9, 'C'),
          node('C', 'data', 1, null),
        ],
        output: [],
      },
      explanation: 'cur and `head.next` refer to the same node. Changing its data through cur changes the one node both of them see.',
    },
  ],
}
