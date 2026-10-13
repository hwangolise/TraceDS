import type { CourseModule } from '../content/modules'

/**
 * The exercise to suggest after finishing `currentId`: the next available one
 * in module order (wrapping around) that isn't completed yet, otherwise the
 * next available one. Null if there is no other available exercise.
 */
export function nextExerciseId(module: CourseModule, currentId: string, completed: Set<string>): string | null {
  const list = module.exercises
  const start = list.findIndex((e) => e.id === currentId)
  const others = list
    .map((_, i) => list[(start + 1 + i) % list.length])
    .filter((e) => e.available && e.id !== currentId)
  return (others.find((e) => !completed.has(e.id)) ?? others[0])?.id ?? null
}
