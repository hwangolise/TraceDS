// Feedback after "Check answer": the misconception hint, or the explanation
// and Continue. A polite live region, so it is announced. Correctness is shown
// with an icon that has an accessible name and with text, not color alone.

import { forwardRef } from 'react'
import type { Feedback } from '../engine/types'
import { RichText } from './RichText'
import { primaryButton } from './ui'

export interface FeedbackPanelProps {
  feedback: Feedback | null
  onContinue: () => void
  continueRef: React.Ref<HTMLButtonElement>
}

export const FeedbackPanel = forwardRef<HTMLDivElement, FeedbackPanelProps>(function FeedbackPanel(
  { feedback, onContinue, continueRef },
  ref,
) {
  return (
    <div ref={ref} data-testid="feedback" aria-live="polite" tabIndex={-1} className="outline-none">
      {feedback?.kind === 'incorrect' && (
        <div className="mt-5 rounded-md border-l-4 border-rose-600 bg-rose-50 px-4 py-3">
          <p className="flex items-center gap-2 font-semibold text-rose-900">
            <span role="img" aria-label="Incorrect">
              ✗
            </span>
            Not quite
          </p>
          <p className="mt-1 leading-relaxed text-slate-900">
            <RichText text={feedback.hint} />
          </p>
          <p className="mt-2 text-sm text-slate-600">Try another choice.</p>
        </div>
      )}
      {feedback?.kind === 'correct' && (
        <div className="mt-5 rounded-md border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-2 font-semibold text-emerald-900">
            <span role="img" aria-label="Correct">
              ✓
            </span>
            Correct
          </p>
          <p className="mt-1 leading-relaxed text-slate-900">
            <RichText text={feedback.explanation} />
          </p>
          <p className="mt-1 text-sm text-slate-600">The memory diagram now shows the state after this step. Anything that changed is marked “changed”.</p>
          <button ref={continueRef} type="button" onClick={onContinue} className={`${primaryButton} mt-4`}>
            Continue
          </button>
        </div>
      )}
    </div>
  )
})
