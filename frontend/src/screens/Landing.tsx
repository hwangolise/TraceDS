// Landing page: what TraceDS is, and one way to start (docs/PRODUCT.md §3, §5).

import { primaryButton } from '../components/ui'
import { hrefFor } from '../router'

export function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
        <p className="text-lg font-semibold tracking-tight">
          Trace<span className="text-indigo-700">DS</span>
        </p>
        <h1 tabIndex={-1} className="mt-6 text-3xl font-semibold leading-tight tracking-tight outline-none sm:text-4xl">
          Learn data structures by tracing what Java does to memory.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-700">
          Interactive Exam #2 practice. Predict each step, see what happens in memory, and learn from mistakes.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <a href={hrefFor({ name: 'module', moduleId: 'linked-lists' })} className={`${primaryButton} px-6 text-base`}>
            Start practicing
          </a>
          <p className="text-sm text-slate-600">No account required.</p>
        </div>
      </main>
    </div>
  )
}
