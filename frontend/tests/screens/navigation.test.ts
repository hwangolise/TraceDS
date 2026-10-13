// Pure helpers behind the student flow: hash routes, local completion
// records, and choosing the next exercise.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { hrefFor, parseHash } from '../../src/router'
import { modules, findModule } from '../../src/content/modules'
import { nextExerciseId } from '../../src/screens/nextExercise'

describe('router', () => {
  it.each([
    ['', { name: 'landing' }],
    ['#', { name: 'landing' }],
    ['#/', { name: 'landing' }],
    ['#/m/linked-lists', { name: 'module', moduleId: 'linked-lists' }],
    ['#/x/LL-01', { name: 'exercise', exerciseId: 'LL-01' }],
    ['#/x/LL-02/done', { name: 'complete', exerciseId: 'LL-02' }],
    ['#/x/LL-01/extra/parts', { name: 'not-found' }],
    ['#/whatever', { name: 'not-found' }],
  ])('parses %j', (hash, route) => {
    expect(parseHash(hash)).toEqual(route)
  })

  it('round-trips hrefs', () => {
    for (const hash of ['#/', '#/m/linked-lists', '#/x/LL-01', '#/x/LL-01/done']) {
      expect(hrefFor(parseHash(hash))).toBe(hash)
    }
  })
})

describe('modules', () => {
  it('Linked Lists lists LL-01..LL-04 in order, all available (M4)', () => {
    const ll = findModule('linked-lists')!
    expect(ll.title).toBe('Linked Lists')
    expect(ll.exercises.map((e) => [e.id, e.available])).toEqual([
      ['LL-01', true],
      ['LL-02', true],
      ['LL-03', true],
      ['LL-04', true],
    ])
    expect(modules.map((m) => m.id)).toEqual(['linked-lists'])
    expect(findModule('recursion')).toBeUndefined()
  })
})

describe('nextExerciseId', () => {
  const ll = () => findModule('linked-lists')!

  it('prefers the next exercise in order that is not yet completed', () => {
    expect(nextExerciseId(ll(), 'LL-01', new Set(['LL-01']))).toBe('LL-02')
    expect(nextExerciseId(ll(), 'LL-02', new Set(['LL-01', 'LL-02']))).toBe('LL-03')
    expect(nextExerciseId(ll(), 'LL-03', new Set(['LL-01', 'LL-02', 'LL-03']))).toBe('LL-04')
    expect(nextExerciseId(ll(), 'LL-04', new Set(['LL-02', 'LL-03', 'LL-04']))).toBe('LL-01')
    expect(nextExerciseId(ll(), 'LL-02', new Set(['LL-02', 'LL-03']))).toBe('LL-04')
  })

  it('wraps around to the next exercise when everything is completed', () => {
    const all = new Set(['LL-01', 'LL-02', 'LL-03', 'LL-04'])
    expect(nextExerciseId(ll(), 'LL-04', all)).toBe('LL-01')
    expect(nextExerciseId(ll(), 'LL-02', all)).toBe('LL-03')
  })

  it('skips unavailable exercises', () => {
    const partial = { ...ll(), exercises: ll().exercises.map((e) => ({ ...e, available: e.id !== 'LL-03' })) }
    expect(nextExerciseId(partial, 'LL-02', new Set(['LL-02']))).toBe('LL-04')
  })

  it('returns null when there is no other available exercise', () => {
    const solo = { ...ll(), exercises: [{ id: 'LL-01', title: 'x', available: true }] }
    expect(nextExerciseId(solo, 'LL-01', new Set())).toBeNull()
  })
})

describe('completion records', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stores completed exercise ids under traceds.completed and never throws', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    const { loadCompleted, markCompleted } = await import('../../src/progress')
    expect([...loadCompleted()]).toEqual([])
    markCompleted('LL-01')
    markCompleted('LL-01')
    markCompleted('LL-02')
    expect(JSON.parse(store.get('traceds.completed')!)).toEqual(['LL-01', 'LL-02'])
    expect([...loadCompleted()]).toEqual(['LL-01', 'LL-02'])

    store.set('traceds.completed', '{not json')
    expect([...loadCompleted()]).toEqual([])

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => markCompleted('LL-01')).not.toThrow()
    expect([...loadCompleted()]).toEqual([])
  })
})
