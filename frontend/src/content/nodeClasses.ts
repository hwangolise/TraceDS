// The Node class shown in each exercise's reference panel, verbatim from
// docs/EXERCISES.md §0.6.

import type { Terminology } from '../engine/types'

export interface NodeClassReference {
  title: string
  code: string[]
  /** Extra fields of the enclosing class, if the exercise needs them (BigNum). */
  ownerFields?: { title: string; code: string[] }
}

export const nodeClasses: Record<Terminology, NodeClassReference> = {
  'generic-node': {
    title: 'Node class',
    code: [
      'public class Node {',
      '    public int data;',
      '    public Node next;',
      '',
      '    public Node() {',
      '        this(0, null);',
      '    }',
      '',
      '    public Node(int data) {',
      '        this(data, null);',
      '    }',
      '',
      '    public Node(int data, Node next) {',
      '        this.data = data;',
      '        this.next = next;',
      '    }',
      '}',
    ],
  },
  'bignum-node': {
    title: 'Node class',
    code: [
      'public class Node {',
      '    public int digit;',
      '    public Node next;',
      '',
      '    public Node() {',
      '        this(0, null);',
      '    }',
      '',
      '    public Node(int digit) {',
      '        this(digit, null);',
      '    }',
      '',
      '    public Node(int digit, Node next) {',
      '        this.digit = digit;',
      '        this.next = next;',
      '    }',
      '}',
    ],
    // EXERCISES.md §0.6: "For LL-04 the panel also lists the BigNum fields".
    ownerFields: { title: 'BigNum fields', code: ['private Node myHead;', 'private int mySize;'] },
  },
}
