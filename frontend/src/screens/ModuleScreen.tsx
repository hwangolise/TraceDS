// A module's exercises in order, with locally remembered completion
// (docs/PRODUCT.md §5, decision A9).

import { Layout } from '../components/Layout'
import { RichText } from '../components/RichText'
import { primaryButton, secondaryButton, textLink } from '../components/ui'
import { getExercise } from '../content'
import type { CourseModule } from '../content/modules'
import { loadCompleted } from '../progress'
import { hrefFor } from '../router'

/** The first sentence of an objective, as a one-line summary. */
const firstSentence = (text: string) => text.match(/^.*?[.?!](?=\s|$)/)?.[0] ?? text

export function ModuleScreen({ module }: { module: CourseModule }) {
  const completed = loadCompleted()
  return (
    <Layout>
      <p className="text-sm">
        <a href={hrefFor({ name: 'landing' })} className={textLink}>
          Home
        </a>
      </p>
      <h1 tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight outline-none">
        {module.title}
      </h1>
      <p className="mt-2 max-w-2xl text-slate-700">{module.summary}</p>

      <ol className="mt-6 max-w-3xl divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {module.exercises.map((entry) => {
          const exercise = entry.available ? getExercise(entry.id) : undefined
          const done = completed.has(entry.id)
          return (
            <li key={entry.id} className={`flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:flex-nowrap ${exercise ? '' : 'text-slate-500'}`}>
              <div className="min-w-0 flex-1">
                <h2 className={`font-semibold ${exercise ? 'text-slate-900' : 'text-slate-600'}`}>
                  <span className="font-mono text-sm font-medium text-slate-500">{entry.id}</span> {entry.title}
                </h2>
                {exercise && (
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">
                    <RichText text={firstSentence(exercise.objective)} />
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {done && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200">
                    ✓ Completed
                  </span>
                )}
                {exercise ? (
                  <a href={hrefFor({ name: 'exercise', exerciseId: entry.id })} className={done ? secondaryButton : primaryButton}>
                    {done ? 'Practice again' : 'Start'}
                    <span className="sr-only"> {entry.id}</span>
                  </a>
                ) : (
                  <span className="text-sm font-medium text-slate-600">Coming next</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Layout>
  )
}
