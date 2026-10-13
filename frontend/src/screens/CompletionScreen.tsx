// Restrained completion summary (docs/PRODUCT.md §5). No scores or celebration.

import { Layout } from '../components/Layout'
import { primaryButton, secondaryButton, textLink } from '../components/ui'
import type { CourseModule } from '../content/modules'
import type { Exercise, StepResult } from '../engine/types'
import { loadCompleted } from '../progress'
import { hrefFor } from '../router'
import { nextExerciseId } from './nextExercise'

export interface CompletionScreenProps {
  exercise: Exercise
  module: CourseModule
  results: StepResult[]
}

export function CompletionScreen({ exercise, module, results }: CompletionScreenProps) {
  const firstTry = results.filter((r) => r.attempts === 1).length
  const hints = results.reduce((n, r) => n + r.hintsShown.length, 0)
  const nextId = nextExerciseId(module, exercise.id, loadCompleted())
  const anotherHref = nextId ? hrefFor({ name: 'exercise', exerciseId: nextId }) : hrefFor({ name: 'module', moduleId: module.id })

  return (
    <Layout>
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
        <p className="font-mono text-sm text-slate-500">
          {exercise.id} {exercise.title}
        </p>
        <h1 tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight outline-none">
          Exercise complete
        </h1>
        <p className="mt-3 text-slate-700">You traced all {results.length} steps.</p>
        <p className="mt-1 text-slate-700">
          {firstTry} of {results.length} correct on the first try · {hints} {hints === 1 ? 'hint' : 'hints'} shown
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={anotherHref} className={primaryButton}>
            Practice another exercise
          </a>
          <a href={hrefFor({ name: 'module', moduleId: module.id })} className={secondaryButton}>
            Back to {module.title}
          </a>
        </div>
        <p className="mt-5 text-sm">
          <a href={hrefFor({ name: 'exercise', exerciseId: exercise.id })} className={textLink}>
            Restart this exercise
          </a>
        </p>
      </div>
    </Layout>
  )
}
