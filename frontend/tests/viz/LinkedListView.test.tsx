// @vitest-environment jsdom
// M2 component tests R1–R2 (docs/TESTING.md §M2), plus read-only and
// accessibility behavior.

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LinkedListView } from '../../src/viz/linkedlist/LinkedListView'
import { toFlow } from '../../src/viz/linkedlist/toFlow'
import { layout } from '../../src/viz/layout'
import { diff } from '../../src/viz/diff'
import { describe as describeState } from '../../src/viz/describe'
import { deepFreeze, docState } from '../fixtures/states'

afterEach(cleanup)

const figure = () => screen.getByRole('figure')
const diagram = () => figure().querySelector('[data-testid="ll-diagram"]') as HTMLElement
const description = () => figure().querySelector('figcaption') as HTMLElement

describe('LinkedListView', () => {
  it('R1 renders the supplied state: node values, null, and the text description', () => {
    const state = deepFreeze(docState('ll01-c2')) // head → [4] → [7] → null
    render(<LinkedListView state={state} />)
    const d = within(diagram())
    expect(d.getByText('4')).toBeTruthy()
    expect(d.getByText('7')).toBeTruthy()
    expect(d.getAllByText('null').length).toBeGreaterThan(0)
    expect(d.getByText('head')).toBeTruthy()
    expect(d.getAllByText('data').length).toBe(2)
    expect(description().textContent).toBe(describeState(state))
    expect(description().className).toContain('sr-only')
  })

  it('R1 shows BigNum terminology and the unspecified marker', () => {
    render(<LinkedListView state={docState('ll04-c1')} />)
    const d = within(diagram())
    expect(d.getAllByText('BigNum')).toHaveLength(2)
    expect(d.getAllByText('myHead')).toHaveLength(2)
    expect(d.getAllByText('digit')).toHaveLength(3)
    expect(d.queryByText('data')).toBeNull()
    const unknown = d.getByText('?')
    expect(unknown.getAttribute('title')).toBe('not shown in this exercise')
  })

  it('R1 labels unreachable nodes in text, not only by styling', () => {
    render(<LinkedListView state={docState('ll03-c3')} />)
    expect(within(diagram()).getByText('unreachable')).toBeTruthy()
  })

  it('R2 re-rendering with the next state updates the description and marks changes', () => {
    const before = docState('ll01-c4')
    const after = docState('ll01-c5')
    const { rerender } = render(<LinkedListView state={before} />)
    expect(diagram().querySelectorAll('[data-changed="true"]')).toHaveLength(0)
    rerender(<LinkedListView state={after} previousState={before} />)
    expect(description().textContent).toBe(describeState(after))
    const changed = [...diagram().querySelectorAll('[data-changed="true"]')].map((el) => el.getAttribute('data-viz-id'))
    expect(changed).toEqual(expect.arrayContaining(['obj:B', 'obj:C']))
    expect(changed).not.toContain('obj:A')
    expect(within(diagram()).getAllByText('changed').length).toBeGreaterThan(0)
  })

  it('the diagram is hidden from assistive technology; the description is announced', () => {
    render(<LinkedListView state={docState('ll01-c2')} />)
    expect(diagram().getAttribute('aria-hidden')).toBe('true')
    expect(description().getAttribute('aria-live')).toBe('polite')
  })

  it('is read-only: no focusable, draggable, selectable, or connectable elements', () => {
    render(<LinkedListView state={docState('ll04-c8')} />)
    expect(diagram().querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0)
    const { nodes, edges } = toFlow(layout(docState('ll04-c8')), null)
    for (const n of nodes) {
      expect(n).toMatchObject({ draggable: false, selectable: false, connectable: false, focusable: false })
    }
    for (const e of edges) expect(e).toMatchObject({ selectable: false, focusable: false })
  })

  it('does not mutate the state it is given', () => {
    const before = deepFreeze(docState('ll03-c2'))
    const after = deepFreeze(docState('ll03-c3'))
    expect(() => render(<LinkedListView state={after} previousState={before} />)).not.toThrow()
    // Guard against a vacuous pass: the frozen state must actually have been rendered.
    expect(within(diagram()).getByText('unreachable')).toBeTruthy()
  })

  it('toFlow maps every layout box and edge, and flags changes', () => {
    const before = docState('ll01-c5')
    const after = docState('ll01-c6')
    const l = layout(after)
    const { nodes, edges } = toFlow(l, diff(before, after))
    expect(nodes.map((n) => n.id)).toEqual(l.boxes.map((b) => b.id))
    expect(edges.map((e) => e.id)).toEqual(l.edges.map((e) => e.id))
    const b = nodes.find((n) => n.id === 'obj:B')!
    expect(b.data).toMatchObject({ changed: true, changedFields: ['data'] })
    expect(nodes.find((n) => n.id === 'obj:A')!.data).toMatchObject({ changed: false })
    expect(b.position).toEqual({ x: l.boxes.find((x) => x.id === 'obj:B')!.x, y: l.boxes.find((x) => x.id === 'obj:B')!.y })
  })
})
