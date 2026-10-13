// The Node class shown in each exercise's reference panel, verbatim from
// docs/EXERCISES.md §0.6.

import type { Terminology } from '../engine/types'

export const nodeClasses: Record<Terminology, { title: string; code: string[] }> = {
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
  },
}
