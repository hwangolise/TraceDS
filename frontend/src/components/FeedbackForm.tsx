// Optional, anonymous feedback on the completion screen (docs/PRODUCT.md §5,
// docs/ANALYTICS.md §5). A quiet section, never a modal, and never in the way
// of the completion actions: a slow or failing backend only changes the text
// inside this section.

import { useEffect, useId, useRef, useState } from 'react'
import { isFeedbackEnabled, submitFeedback, type FeedbackInput, type FeedbackTopic } from '../analytics/events'
import type { Exercise } from '../engine/types'
import { primaryButton } from './ui'

export interface FeedbackFormProps {
  exercise: Pick<Exercise, 'id' | 'moduleId'>
}

const MAX_COMMENT_CHARS = 2000
const RATINGS = [1, 2, 3, 4, 5] as const
const TOPICS: { value: FeedbackTopic; label: string }[] = [
  { value: 'linked-lists', label: 'Linked lists' },
  { value: 'recursion', label: 'Recursion' },
  { value: 'quicksort', label: 'Quicksort' },
  { value: 'big-o', label: 'Big-O' },
  { value: 'arrays-vs-linked-lists', label: 'Arrays vs. linked lists' },
  { value: 'stacks', label: 'Stacks' },
]

type Status = 'idle' | 'sending' | 'failed' | 'sent'

const fieldClass =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

export function FeedbackForm({ exercise }: FeedbackFormProps) {
  const ids = useId()
  const [rating, setRating] = useState<FeedbackInput['helpfulness'] | null>(null)
  const [topic, setTopic] = useState<FeedbackTopic | ''>('')
  const [comments, setComments] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  if (!isFeedbackEnabled()) return null

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault()
    if (rating === null || inFlight.current || status === 'sent') return
    inFlight.current = true
    setStatus('sending')
    const trimmed = comments.trim()
    const ok = await submitFeedback(
      {
        helpfulness: rating,
        ...(topic ? { requestedTopic: topic } : {}),
        ...(trimmed ? { comments: trimmed } : {}),
      },
      exercise,
    )
    inFlight.current = false
    if (mounted.current) setStatus(ok ? 'sent' : 'failed')
  }

  const sending = status === 'sending'
  const hintId = `${ids}-hint`
  const noticeId = `${ids}-notice`
  const counterId = `${ids}-counter`

  return (
    <section aria-labelledby={`${ids}-title`} className="mt-8 border-t border-slate-200 pt-6">
      <div role="status">
        {status === 'sent' && <p className="text-sm text-slate-700">Thanks for the feedback.</p>}
        {status === 'failed' && (
          <p className="mb-4 text-sm text-slate-700">Couldn&apos;t send feedback right now. You can keep practicing.</p>
        )}
      </div>
      {status !== 'sent' && (
        <>
          <h2 id={`${ids}-title`} className="text-base font-semibold text-slate-900">
            Help improve TraceDS
          </h2>
          <form onSubmit={onSubmit} className="mt-4 space-y-5" noValidate>
            <div>
              <p id={`${ids}-rating`} className="text-sm font-medium text-slate-800">
                How helpful was TraceDS for studying?
              </p>
              <div role="radiogroup" aria-labelledby={`${ids}-rating`} className="mt-2 flex gap-2">
                {RATINGS.map((n) => (
                  <label key={n} className="relative inline-flex">
                    <input
                      type="radio"
                      name={`${ids}-helpfulness`}
                      checked={rating === n}
                      onChange={() => setRating(n)}
                      className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-800 peer-checked:border-indigo-700 peer-checked:bg-indigo-700 peer-checked:text-white peer-hover:bg-slate-50 peer-checked:peer-hover:bg-indigo-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600">
                      {n}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-1 flex max-w-60 justify-between text-xs text-slate-600">
                <span>Not helpful</span>
                <span>Very helpful</span>
              </div>
            </div>

            <div>
              <label htmlFor={`${ids}-topic`} className="text-sm font-medium text-slate-800">
                What should I add more practice for? <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <select
                id={`${ids}-topic`}
                value={topic}
                onChange={(e) => setTopic(e.target.value as FeedbackTopic | '')}
                className={`${fieldClass} sm:max-w-xs`}
              >
                <option value="">Choose a topic</option>
                {TOPICS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${ids}-comments`} className="text-sm font-medium text-slate-800">
                What should I improve? <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <textarea
                id={`${ids}-comments`}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                maxLength={MAX_COMMENT_CHARS}
                rows={3}
                aria-describedby={`${noticeId} ${counterId}`}
                className={fieldClass}
              />
              <div className="mt-1 flex justify-between gap-4 text-xs text-slate-600">
                <p id={noticeId}>Please don&apos;t include your name, email, or student ID.</p>
                <p id={counterId} className="shrink-0">{`${comments.length} / ${MAX_COMMENT_CHARS}`}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={rating === null || sending}
                aria-describedby={rating === null ? hintId : undefined}
                className={primaryButton}
              >
                {sending ? 'Sending…' : status === 'failed' ? 'Try again' : 'Submit feedback'}
              </button>
              {rating === null && (
                <p id={hintId} className="text-xs text-slate-600">
                  Choose a rating to submit.
                </p>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  )
}
