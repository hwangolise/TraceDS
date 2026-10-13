// M2 diff tests D1–D4 (docs/TESTING.md §M2): what changed between two states.

import { describe, expect, it } from 'vitest'
import { diff, isEmptyChangeSet } from '../../src/viz/diff'
import { deepFreeze, docState, makeState, node } from '../fixtures/states'

const empty = { objects: [], removedObjects: [], fields: [], variables: [], outputChanged: false }

describe('diff', () => {
  it('D1 a changed next field is reported (LL-01 c4 → c5)', () => {
    const changes = diff(deepFreeze(docState('ll01-c4')), deepFreeze(docState('ll01-c5')))
    expect(changes.fields).toEqual(['B.next'])
    expect(changes.objects).toEqual(['B', 'C']) // B changed, C added
    expect(changes.variables).toEqual([])
  })

  it('D2 a changed data field is reported (LL-01 c5 → c6)', () => {
    const changes = diff(docState('ll01-c5'), docState('ll01-c6'))
    expect(changes).toEqual({ ...empty, objects: ['B'], fields: ['B.data'] })
  })

  it('D3 a changed variable target is reported, and nothing else (LL-01 c3 → c4)', () => {
    const changes = diff(docState('ll01-c3'), docState('ll01-c4'))
    expect(changes).toEqual({ ...empty, variables: ['0:cur'] })
  })

  it('D3 added and removed variables are reported (LL-02 c7 → c8)', () => {
    expect(diff(docState('ll01-c2'), docState('ll01-c3')).variables).toEqual(['0:cur'])
    expect(diff(docState('ll02-c7'), docState('ll02-c8')).variables).toEqual(['0:cur'])
  })

  it('D4 added and removed objects are reported (LL-03 c3 → c4)', () => {
    const changes = diff(docState('ll03-c3'), docState('ll03-c4'))
    expect(changes.objects).toEqual(['E'])
    expect(changes.removedObjects).toEqual(['B'])
    expect(changes.variables).toEqual(['0:head'])
  })

  it('reports output changes', () => {
    expect(diff(docState('ll02-c1'), docState('ll02-c2')).outputChanged).toBe(true)
    expect(diff(docState('ll02-c2'), docState('ll02-c3')).outputChanged).toBe(false)
  })

  it('identical states produce an empty change set', () => {
    const a = makeState({ head: 'A' }, [node('A', 1, null)])
    const changes = diff(a, structuredClone(a))
    expect(changes).toEqual(empty)
    expect(isEmptyChangeSet(changes)).toBe(true)
    expect(isEmptyChangeSet(diff(docState('ll04-c1'), docState('ll04-c2')))).toBe(true)
    expect(isEmptyChangeSet(diff(docState('ll01-c1'), docState('ll01-c2')))).toBe(false)
  })
})
