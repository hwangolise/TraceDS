// Registry of exercises that have content. Exercises listed in modules.ts but
// absent here are shown as "coming next" and cannot be opened.

import type { Exercise } from '../engine/types'
import { ll01 } from './ll01'
import { ll02 } from './ll02'
import { ll03 } from './ll03'
import { ll04 } from './ll04'

export const exercises: Record<string, Exercise> = {
  [ll01.id]: ll01,
  [ll02.id]: ll02,
  [ll03.id]: ll03,
  [ll04.id]: ll04,
}

export function getExercise(id: string): Exercise | undefined {
  return Object.hasOwn(exercises, id) ? exercises[id] : undefined
}
