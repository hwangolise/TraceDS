// Text alternative for the diagram (docs/ARCHITECTURE.md §6.3): deterministic,
// complete, and independent of color, animation, and arrow position.

import { describe as group, expect, it } from 'vitest'
import { describe } from '../../src/viz/describe'
import { bigNum, deepFreeze, docState, docStates, makeState, node, ref, unspecified } from '../fixtures/states'

group('describe', () => {
  it('empty state', () => {
    expect(describe(makeState({}, []))).toBe('No variables yet. Output: none.')
  })

  it('null reference', () => {
    expect(describe(makeState({ head: null }, []))).toBe('head is null. Output: none.')
  })

  it('one-node list', () => {
    expect(describe(makeState({ head: 'A' }, [node('A', 4, null)]))).toBe(
      'head refers to node 1. Node 1 has data 4, and its next is null. List from head: 4 → null. Output: none.',
    )
  })

  it('multi-node list with a temporary reference (LL-01 c5)', () => {
    expect(describe(deepFreeze(docState('ll01-c5')))).toBe(
      'head refers to node 1. cur refers to node 2. ' +
        'Node 1 has data 4, and its next refers to node 2. ' +
        'Node 2 has data 7, and its next refers to node 3. ' +
        'Node 3 has data 1, and its next is null. ' +
        'List from head: 4 → 7 → 1 → null. Output: none.',
    )
  })

  it('multiple references to one node (LL-01 c3)', () => {
    expect(describe(docState('ll01-c3'))).toContain('head refers to node 1. cur refers to node 1.')
  })

  it('output lines (LL-02 c4)', () => {
    expect(describe(docState('ll02-c4'))).toMatch(/Output: 3, 8\.$/)
  })

  it('a variable holding null (LL-02 c7)', () => {
    expect(describe(docState('ll02-c7'))).toContain('cur is null.')
  })

  it('unreachable node (LL-03 after c3)', () => {
    const text = describe(docState('ll03-c3'))
    expect(text).toContain('List from head: 2 → 5 → 9 → null.')
    expect(text).toContain('Node 4 has data 6, and its next refers to node 3.')
    expect(text).toContain('Node 4 is unreachable.')
  })

  it('BigNum terminology: digit, myHead, mySize (LL-04 c4)', () => {
    expect(describe(docState('ll04-c4'))).toBe(
      'this refers to BigNum 1. copy refers to BigNum 2. newPtr refers to node 4. origPtr refers to node 2. ' +
        'BigNum 1 has mySize 3, and its myHead refers to node 1. ' +
        'Node 1 has digit 4, and its next refers to node 2. ' +
        'Node 2 has digit 7, and its next refers to node 3. ' +
        'Node 3 has digit 2, and its next is null. ' +
        'BigNum 2 has mySize 3, and its myHead refers to node 4. ' +
        'Node 4 has digit 4, and its next is null. ' +
        'List from this.myHead: 4 → 7 → 2 → null. List from copy.myHead: 4 → null. Output: none.',
    )
  })

  it('unspecified reference reads "not shown in this exercise" (LL-04 c1)', () => {
    const text = describe(docState('ll04-c1'))
    expect(text).toContain('BigNum 2 has mySize 3; myHead: not shown in this exercise.')
    expect(text).not.toContain('List from copy.myHead')
    expect(text).not.toMatch(/myHead (is|refers to) null/)
  })

  it('BigNum with myHead null, int and unspecified variables', () => {
    const text = describe(makeState({ copy: 'Y', n: { kind: 'int', value: 3 }, x: unspecified }, [bigNum('Y', ref(null), 0)]))
    expect(text).toBe(
      'copy refers to BigNum 1. n is 3. x: not shown in this exercise. ' +
        'BigNum 1 has mySize 0, and its myHead is null. List from copy.myHead: null. Output: none.',
    )
  })

  it('cycles terminate in the list summary', () => {
    expect(describe(makeState({ head: 'A' }, [node('A', 1, 'B'), node('B', 2, 'A')]))).toContain(
      'List from head: 1 → 2 → back to node 1.',
    )
  })

  it('names frames when there is more than one', () => {
    const state = makeState({ head: 'A' }, [node('A', 1, null)])
    state.frames.push({ method: 'helper()', variables: [{ name: 'cur', value: ref('A') }] })
    expect(describe(state)).toContain('In main: head refers to node 1. In helper(): cur refers to node 1.')
  })

  it('is deterministic and never mentions internal object ids', () => {
    for (const [key, state] of docStates()) {
      const text = describe(state)
      expect(describe(structuredClone(state)), key).toBe(text)
      expect(text, key).not.toMatch(/\b(?:node|Node|BigNum) [A-Z]\b|"[A-Z]"/)
    }
  })
})
