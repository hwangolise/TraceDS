// Course modules and the order of their exercises (docs/PRODUCT.md §5–6).
// Titles of not-yet-available exercises come from docs/EXERCISES.md.

import { exercises } from './index'

export interface ModuleExercise {
  id: string
  title: string
  /** False for exercises listed as "coming next" without content yet. */
  available: boolean
}

export interface CourseModule {
  id: string
  title: string
  summary: string
  exercises: ModuleExercise[]
}

const entry = (id: string, title: string): ModuleExercise => ({ id, title, available: id in exercises })

export const modules: CourseModule[] = [
  {
    id: 'linked-lists',
    title: 'Linked Lists',
    summary: 'References, nodes, traversal, mutation, and deep copying, traced one step at a time.',
    exercises: [
      entry('LL-01', 'References & Node Construction'),
      entry('LL-02', 'Linked List Traversal'),
      entry('LL-03', 'Linked List Mutation'),
      entry('LL-04', 'BigNum Deep Copy'),
    ],
  },
]

export function findModule(id: string): CourseModule | undefined {
  return modules.find((m) => m.id === id)
}
