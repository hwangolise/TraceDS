// Dev-only visualization harness (M2): open the dev server with
// ?viz-harness. Renders every LL-01..LL-04 state from docs/EXERCISES.md in a
// 600×400 panel and a 360 px-wide panel, with changes from the previous state
// highlighted. Not included in production builds (see main.tsx).

import exercisesMarkdown from '../../../docs/EXERCISES.md?raw'
import { LinkedListView } from '../viz/linkedlist/LinkedListView'
import { describe } from '../viz/describe'
import { parseExerciseStates } from './notation'

export function VizHarness() {
  // Optional ?only=<prefix> (e.g. only=ll04) narrows the list for close inspection.
  const only = new URLSearchParams(window.location.search).get('only') ?? ''
  const all = parseExerciseStates(exercisesMarkdown)
  const states = all.filter((s) => s.key.startsWith(only))
  return (
    <main className="mx-auto max-w-6xl space-y-8 bg-white p-4 text-left text-slate-900">
      <header>
        <h1 className="text-2xl font-semibold">Visualization harness</h1>
        <p className="text-sm text-slate-600">
          Dev only. {states.length} states from docs/EXERCISES.md. Left: 600×400 panel. Right: 360 px wide.
        </p>
      </header>
      {states.map((entry) => {
        const at = all.indexOf(entry)
        const previous = at > 0 && all[at - 1].exerciseId === entry.exerciseId ? all[at - 1].state : null
        return (
          <section key={entry.key} id={entry.key} className="space-y-2 border-t border-slate-200 pt-4">
            <h2 className="font-mono text-lg">{entry.key}</h2>
            <div className="flex flex-wrap items-start gap-4">
              <div className="overflow-hidden rounded border border-slate-300" style={{ width: 600, height: 400 }}>
                <LinkedListView state={entry.state} previousState={previous} />
              </div>
              <div className="overflow-hidden rounded border border-slate-300" style={{ width: 360 }}>
                <LinkedListView state={entry.state} previousState={previous} />
              </div>
            </div>
            <p className="max-w-3xl text-sm text-slate-700">{describe(entry.state)}</p>
          </section>
        )
      })}
    </main>
  )
}
