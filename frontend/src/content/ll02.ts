// LL-02 — Linked List Traversal. Transcribed verbatim from docs/EXERCISES.md, which is
// authoritative. tests/content/ checks this file against the doc.

import type { Exercise } from '../engine/types'
import { frame, node, ref, v } from './build'

export const ll02: Exercise = {
  id: 'LL-02',
  moduleId: 'linked-lists',
  title: 'Linked List Traversal',
  objective: 'Trace `cur` through a list using the course\'s standard `for` traversal. Predict the output, the loop variable\'s position, and exactly when and why the loop stops. Includes `null` and off-by-one reasoning.',
  code: [
    'for(Node cur = head; cur != null; cur = cur.next) {',
    '    System.out.println(cur.data);',
    '}',
  ],
  terminology: 'generic-node',
  visualization: 'linked-list',
  initialState: {
    frames: [frame('main', [v('head', ref('A'))])],
    heap: [
      node('A', 'data', 3, 'B'),
      node('B', 'data', 8, 'C'),
      node('C', 'data', 5, null),
    ],
    output: [],
  },
  checkpoints: [
    {
      id: 'll02-c1',
      lines: [1],
      focus: 'Node cur = head',
      concept: 'traversal',
      question: 'The loop\'s initialization runs. What does cur refer to?',
      choices: [
        {
          id: 'a',
          text: 'null, because cur is assigned in the update step.',
          misconception: { id: 'loop-init-order', hint: 'A for loop has three parts. The initialization runs once, first, before the condition is ever checked.' },
        },
        { id: 'b', text: 'The node containing 3, the same node head refers to.' },
        {
          id: 'c',
          text: 'The node containing 8.',
          misconception: { id: 'update-before-first-iteration', hint: 'The update `cur = cur.next` runs *after* each pass through the body. It doesn\'t run before the first one.' },
        },
        {
          id: 'd',
          text: 'A new copy of the node containing 3.',
          misconception: { id: 'assignment-copies-object', hint: 'Is there a `new` here? `cur = head` copies a reference, not a node.' },
        },
      ],
      correctChoiceId: 'b',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('A'))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: [],
      },
      explanation: 'The initialization `Node cur = head` runs once. cur now refers to the first node, the same node head refers to.',
    },
    {
      id: 'll02-c2',
      lines: [2],
      concept: 'traversal',
      question: '`cur != null` is true, so the body runs. What does line 2 print?',
      choices: [
        { id: 'a', text: '3' },
        {
          id: 'b',
          text: 'The Node object itself (something like `Node@1b6d3586`)',
          misconception: { id: 'ref-vs-data', hint: 'Look at what\'s passed to println: `cur.data`, not `cur`. What is the data field of the node cur refers to?' },
        },
        {
          id: 'c',
          text: '8',
          misconception: { id: 'update-before-first-iteration', hint: 'cur hasn\'t moved yet. The update runs after the body, so this pass uses the node cur was initialized to.' },
        },
      ],
      correctChoiceId: 'a',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('A'))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: ['3'],
      },
      explanation: 'cur refers to the node containing 3, so `cur.data` is 3.',
    },
    {
      id: 'll02-c3',
      lines: [1],
      focus: 'cur = cur.next',
      concept: 'temp-references',
      question: 'The update runs. Which statement is true afterward?',
      choices: [
        {
          id: 'a',
          text: 'cur and head both refer to the node containing 8.',
          misconception: { id: 'alias-variables-linked', hint: 'The update assigns only to cur. head is a separate variable, and nothing here assigns to it.' },
        },
        { id: 'b', text: 'cur refers to the node containing 8. head is unchanged.' },
        {
          id: 'c',
          text: 'cur refers to the node containing 8, and the node containing 3 is unlinked from the list.',
          misconception: { id: 'moving-ref-mutates-list', hint: '`cur = cur.next` changes the variable cur only. No next field is assigned, so the list\'s links are unchanged.' },
        },
      ],
      correctChoiceId: 'b',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('B'))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: ['3'],
      },
      explanation: '`cur.next` is read from the node containing 3, giving the node containing 8. That reference is stored in cur. The list itself doesn\'t change.',
    },
    {
      id: 'll02-c4',
      lines: [1, 2],
      focus: 'cur != null',
      concept: 'traversal',
      question: 'The condition is checked again and the body runs. What is the complete output so far?',
      choices: [
        {
          id: 'a',
          text: '3, 3',
          misconception: { id: 'head-vs-cur', hint: 'The body prints `cur.data`, not `head.data`. Where does cur refer now?' },
        },
        {
          id: 'b',
          text: '3, 8, 5',
          misconception: { id: 'body-runs-all', hint: 'One pass through the body handles one node. The loop only moves on to the next node in the update.' },
        },
        { id: 'c', text: '3, 8' },
      ],
      correctChoiceId: 'c',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('B'))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: ['3', '8'],
      },
      explanation: 'cur isn\'t null, so the body runs for the node containing 8. It prints 8.',
    },
    {
      id: 'll02-c5',
      lines: [1],
      focus: 'cur = cur.next',
      concept: 'traversal',
      question: 'The update runs again. Where does cur refer?',
      choices: [
        { id: 'a', text: 'The node containing 5.' },
        {
          id: 'b',
          text: 'The node containing 3, because traversal wraps back to head.',
          misconception: { id: 'wraps-to-head', hint: 'Follow the next field of the node cur currently refers to. Does any node\'s next refer to the node containing 3?' },
        },
      ],
      correctChoiceId: 'a',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('C'))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: ['3', '8'],
      },
      explanation: 'The next field of the node containing 8 refers to the node containing 5. In a list that ends in null, nothing points back to the front.',
    },
    {
      id: 'll02-c6',
      lines: [1, 2],
      focus: 'cur != null',
      concept: 'loop-termination',
      question: 'cur refers to the last node. The condition is checked and the body runs. What is the complete output afterward?',
      choices: [
        {
          id: 'a',
          text: '3, 8, because the last node is skipped when its next is null.',
          misconception: { id: 'checks-next-not-cur', hint: 'Read the condition carefully. It tests `cur != null`, not `cur.next != null`. Is cur itself null right now?' },
        },
        { id: 'b', text: '3, 8, 5' },
        {
          id: 'c',
          text: '3, 8, 5, null',
          misconception: { id: 'counts-null', hint: 'The body runs only while cur refers to a node, and each pass prints that node\'s data. Is null a node?' },
        },
      ],
      correctChoiceId: 'b',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref('C'))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: ['3', '8', '5'],
      },
      explanation: 'cur refers to a node, so `cur != null` is true even though that node\'s next is null. The body prints 5.',
    },
    {
      id: 'll02-c7',
      lines: [1],
      focus: 'cur = cur.next',
      concept: 'null-references',
      question: 'The update runs while cur refers to the last node. What happens?',
      choices: [
        {
          id: 'a',
          text: 'cur stays at the node containing 5, because there is no next node.',
          misconception: { id: 'null-assign-fails', hint: 'The node does have a next field, and its value is null. Assigning null to cur is an ordinary assignment.' },
        },
        {
          id: 'b',
          text: 'A NullPointerException is thrown.',
          misconception: { id: 'null-read-throws', hint: 'cur still refers to a real node, so reading `cur.next` is safe. The value it reads just happens to be null. An exception happens only when you use a dot on a null reference.' },
        },
        { id: 'c', text: 'cur becomes null.' },
        {
          id: 'd',
          text: 'cur refers to the node containing 3.',
          misconception: { id: 'wraps-to-head', hint: 'Look at the next field of the node containing 5. What value does it hold?' },
        },
      ],
      correctChoiceId: 'c',
      resultState: {
        frames: [frame('main', [v('head', ref('A')), v('cur', ref(null))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: ['3', '8', '5'],
      },
      explanation: 'The last node\'s next is null, so `cur = cur.next` stores null in cur. Reading a null *value* is fine. Using a dot *on* null would throw.',
    },
    {
      id: 'll02-c8',
      lines: [1],
      focus: 'cur != null',
      concept: 'loop-termination',
      question: 'The condition is checked with cur equal to null. What happens next?',
      choices: [
        {
          id: 'a',
          text: 'The body runs one more time before the loop stops.',
          misconception: { id: 'condition-checked-after-body', hint: 'A for loop checks its condition before every pass, including this one. What does `cur != null` evaluate to now?' },
        },
        { id: 'b', text: 'The loop ends. Nothing more is printed.' },
        {
          id: 'c',
          text: 'A NullPointerException is thrown when `cur != null` is checked.',
          misconception: { id: 'null-compare-throws', hint: 'Comparing a reference with `!=` doesn\'t use a dot, so nothing is dereferenced. The comparison simply evaluates to true or false.' },
        },
      ],
      correctChoiceId: 'b',
      resultState: {
        frames: [frame('main', [v('head', ref('A'))])],
        heap: [
          node('A', 'data', 3, 'B'),
          node('B', 'data', 8, 'C'),
          node('C', 'data', 5, null),
        ],
        output: ['3', '8', '5'],
      },
      explanation: '`cur != null` is false, so the loop exits. cur was declared in the for header, so it no longer exists. Every node was printed exactly once.',
    },
  ],
}
