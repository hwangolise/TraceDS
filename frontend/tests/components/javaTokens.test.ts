// The small hand-written Java tokenizer used for code highlighting
// (docs/ARCHITECTURE.md §5.2). Display only.

import { describe, expect, it } from 'vitest'
import { tokenizeJava } from '../../src/components/javaTokens'
import { ll01 } from '../../src/content/ll01'
import { ll02 } from '../../src/content/ll02'

describe('tokenizeJava', () => {
  it('classifies keywords, class names, numbers, and plain text without losing characters', () => {
    expect(tokenizeJava('Node head = new Node(4);')).toEqual([
      { kind: 'type', text: 'Node' },
      { kind: 'plain', text: ' head = ' },
      { kind: 'keyword', text: 'new' },
      { kind: 'plain', text: ' ' },
      { kind: 'type', text: 'Node' },
      { kind: 'plain', text: '(' },
      { kind: 'number', text: '4' },
      { kind: 'plain', text: ');' },
    ])
  })

  it('handles null, for, comments, and indentation', () => {
    expect(tokenizeJava('cur.next = new Node(1, null);').filter((t) => t.kind !== 'plain').map((t) => t.text)).toEqual([
      'new',
      'Node',
      '1',
      'null',
    ])
    expect(tokenizeJava('// prev refers to the node containing 2')).toEqual([
      { kind: 'comment', text: '// prev refers to the node containing 2' },
    ])
    expect(tokenizeJava('    System.out.println(cur.data);').map((t) => t.text).join('')).toBe('    System.out.println(cur.data);')
    expect(tokenizeJava('for(Node cur = head; cur != null; cur = cur.next) {')[0]).toEqual({ kind: 'keyword', text: 'for' })
  })

  it('reassembles every content line exactly', () => {
    const lines = [...ll01.code, ...ll02.code]
    expect(lines.length).toBe(9) // guards against a vacuous pass over empty content
    for (const line of lines) {
      expect(tokenizeJava(line).map((t) => t.text).join('')).toBe(line)
    }
  })

  it('does not highlight keywords inside identifiers', () => {
    expect(tokenizeJava('newPtr = forward;').every((t) => t.kind === 'plain')).toBe(true)
  })
})
