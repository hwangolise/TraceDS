// Registry of exercises that have content. Exercises listed in modules.ts but
// absent here are shown as "coming next" and cannot be opened.

import type { Exercise } from '../engine/types'
import { ll01 } from './ll01'
import { ll02 } from './ll02'

export const exercises: Record<string, Exercise> = {
  [ll01.id]: ll01,
  [ll02.id]: ll02,
}

export function getExercise(id: string): Exercise | undefined {
  return Object.hasOwn(exercises, id) ? exercises[id] : undefined
}
