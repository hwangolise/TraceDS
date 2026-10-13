// The exercise screen (docs/ARCHITECTURE.md §5.2, docs/PRODUCT.md §4).
//
// Owns exactly one piece of state, the engine's ExerciseRun, plus the
// student's current (unsubmitted) selection. Every correctness decision and
// state transition comes from the engine; this screen only displays the run.

import { useEffect, useRef, useState } from 'react'
import { CodePanel } from '../components/CodePanel'
import { FeedbackPanel } from '../components/FeedbackPanel'
import { OutputPanel } from '../components/OutputPanel'
import { QuestionPanel } from '../components/QuestionPanel'
import { secondaryButton, textLink } from '../components/ui'
import { continueRun, restartRun, startRun, submitAnswer } from '../engine/engine'
import type { Exercise, StepResult } from '../engine/types'
import { findModule } from '../content/modules'
import { hrefFor } from '../router'
import { LinkedListView } from '../viz/linkedlist/LinkedListView'

export interface ExerciseScreenProps {
  exercise: Exercise
  onComplete: (results: StepResult[]) => void
}

type PendingFocus = 'hint' | 'continue' | 'question' | null

export function ExerciseScreen({ exercise, onComplete }: ExerciseScreenProps) {
  const [run, setRun] = useState(() => startRun(exercise))
  const [selected, setSelected] = useState<string | null>(null)
  const pendingFocus = useRef<PendingFocus>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const legendRef = useRef<HTMLLegendElement>(null)
  const memoryRef = useRef<HTMLElement>(null)

  const total = exercise.checkpoints.length
  const reviewing = run.phase === 'explanation'
  // During review, the screen still shows the checkpoint just answered.
  const shownIndex = reviewing ? run.stepIndex - 1 : Math.min(run.stepIndex, total - 1)
  const checkpoint = exercise.checkpoints[shownIndex]
  const acceptedChoiceId = run.feedback?.kind === 'correct' ? run.feedback.choiceId : null
  const showsOutput = [exercise.initialState, ...exercise.checkpoints.map((c) => c.resultState)].some((s) => s.output.length > 0)
  const module = findModule(exercise.moduleId)

  useEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (target === 'hint') feedbackRef.current?.focus()
    if (target === 'question') legendRef.current?.focus()
    if (target === 'continue') {
      // Show the changed memory first. Continue is focused without scrolling;
      // the page only moves if the memory panel is not fully in view (phones,
      // and long code such as LL-04 on desktop).
      continueRef.current?.focus({ preventScroll: true })
      const rect = memoryRef.current?.getBoundingClientRect()
      if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
        memoryRef.current?.scrollIntoView?.({ block: 'start' })
      }
    }
  }, [run])

  const check = () => {
    if (!selected) return
    const { run: next, outcome } = submitAnswer(exercise, run, selected)
    if (outcome.type === 'rejected') return
    pendingFocus.current = outcome.type === 'correct' ? 'continue' : 'hint'
    setSelected(null)
    setRun(next)
  }

  const proceed = () => {
    const next = continueRun(exercise, run)
    if (next.phase === 'complete') {
      onComplete(next.results)
      return
    }
    pendingFocus.current = 'question'
    setRun(next)
  }

  const restart = () => {
    setSelected(null)
    setRun(restartRun(exercise))
  }

  return (
    <div>
      {module && (
        <p className="text-sm">
          <a href={hrefFor({ name: 'module', moduleId: module.id })} className={textLink}>
            {module.title}
          </a>
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <h1 tabIndex={-1} className="text-xl font-semibold tracking-tight text-slate-900 outline-none sm:text-2xl">
          <span className="font-mono text-slate-500">{exercise.id}</span> {exercise.title}
        </h1>
        <button type="button" onClick={restart} className={secondaryButton}>
          Restart
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <p className="shrink-0 text-sm font-medium text-slate-700">
          Step {shownIndex + 1} of {total}
        </p>
        <div aria-hidden="true" className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600"
            style={{ width: `${((reviewing ? shownIndex + 1 : shownIndex) / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="code-heading" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
          <h2 id="code-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Java
          </h2>
          <CodePanel
            code={exercise.code}
            highlighted={checkpoint.lines}
            mode={reviewing ? 'ran' : 'next'}
            focus={checkpoint.focus}
            terminology={exercise.terminology}
          />
        </section>
        <section ref={memoryRef} aria-labelledby="memory-heading" className="min-w-0 scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 id="memory-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Memory
          </h2>
          <LinkedListView state={run.state} previousState={reviewing ? run.previousState : null} />
          {showsOutput && <OutputPanel lines={run.state.output} />}
        </section>
      </div>

      <section aria-label="Prediction" className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <QuestionPanel
          ref={legendRef}
          stepKey={checkpoint.id}
          question={checkpoint.question}
          choices={checkpoint.choices}
          selected={selected}
          eliminated={run.eliminated}
          acceptedChoiceId={acceptedChoiceId}
          onSelect={setSelected}
          onCheck={check}
        />
        <FeedbackPanel ref={feedbackRef} feedback={run.feedback} onContinue={proceed} continueRef={continueRef} />
      </section>
    </div>
  )
}
