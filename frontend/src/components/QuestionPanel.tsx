// The prediction question: a native radio group plus an explicit
// "Check answer" button, so selecting never submits (decision A8).
// Which choices are eliminated or correct comes from the engine's run.

import { forwardRef } from 'react'
import type { Choice } from '../engine/types'
import { RichText } from './RichText'
import { primaryButton } from './ui'

export interface QuestionPanelProps {
  stepKey: string
  question: string
  choices: Choice[]
  selected: string | null
  /** Wrong choices already tried; disabled. */
  eliminated: string[]
  /** Set during review: the choice the engine accepted as correct. */
  acceptedChoiceId: string | null
  onSelect: (choiceId: string) => void
  onCheck: () => void
}

export const QuestionPanel = forwardRef<HTMLLegendElement, QuestionPanelProps>(function QuestionPanel(
  { stepKey, question, choices, selected, eliminated, acceptedChoiceId, onSelect, onCheck },
  legendRef,
) {
  const reviewing = acceptedChoiceId !== null
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (selected && !reviewing) onCheck()
      }}
    >
      <fieldset>
        <legend ref={legendRef} tabIndex={-1} className="mb-3 text-base font-semibold leading-relaxed text-slate-900 outline-none sm:text-lg">
          <RichText text={question} />
        </legend>
        <div className="space-y-2">
          {choices.map((choice) => {
            const id = `choice-${stepKey}-${choice.id}`
            const wrong = eliminated.includes(choice.id)
            const accepted = acceptedChoiceId === choice.id
            const disabled = reviewing || wrong
            return (
              <div
                key={choice.id}
                className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
                  accepted
                    ? 'border-emerald-600 bg-emerald-50'
                    : wrong
                      ? 'border-slate-200 bg-slate-50'
                      : selected === choice.id
                        ? 'border-indigo-600 bg-indigo-50/60'
                        : 'border-slate-300 bg-white hover:border-slate-400'
                }`}
              >
                <input
                  id={id}
                  type="radio"
                  name={`prediction-${stepKey}`}
                  value={choice.id}
                  checked={accepted || (!reviewing && selected === choice.id)}
                  disabled={disabled}
                  onChange={() => onSelect(choice.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                />
                <label htmlFor={id} className={`flex-1 leading-relaxed ${disabled ? '' : 'cursor-pointer'} ${wrong ? 'text-slate-500' : 'text-slate-900'}`}>
                  <RichText text={choice.text} />
                </label>
                {wrong && (
                  <span className="mt-0.5 shrink-0 whitespace-nowrap rounded bg-rose-50 px-1.5 text-xs font-semibold leading-5 text-rose-800 ring-1 ring-rose-200">
                    ✗ Not quite
                  </span>
                )}
                {accepted && (
                  <span className="mt-0.5 shrink-0 whitespace-nowrap rounded bg-emerald-100 px-1.5 text-xs font-semibold leading-5 text-emerald-900 ring-1 ring-emerald-300">
                    ✓ Correct
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </fieldset>
      {!reviewing && (
        <div className="mt-4">
          <button type="submit" disabled={!selected} className={primaryButton}>
            Check answer
          </button>
        </div>
      )}
    </form>
  )
})
