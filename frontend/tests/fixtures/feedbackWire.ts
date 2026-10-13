// Test-only harness for the M8 feedback request at the network boundary
// (docs/ANALYTICS.md §5, docs/ARCHITECTURE.md §9.2). Asserts what leaves the
// browser, never which internal function sent it.
import { API_BASE, type FetchCall } from './analyticsWire'

export const FEEDBACK_URL = `${API_BASE}/api/v1/feedback`
export const FEEDBACK_ERROR_COPY = "Couldn't send feedback right now. You can keep practicing."
export const FEEDBACK_THANKS_COPY = 'Thanks for the feedback.'

export const feedbackCalls = (calls: FetchCall[]) => calls.filter((c) => c.url === FEEDBACK_URL)

export function feedbackBodies(calls: FetchCall[]): Record<string, unknown>[] {
  return feedbackCalls(calls).map((c) => {
    if (typeof c.init?.body !== 'string') throw new Error('feedback body must be a JSON string')
    return JSON.parse(c.init.body) as Record<string, unknown>
  })
}

/** The student-facing topic labels, in order, with the wire values they send. */
export const TOPICS: [label: string, value: string][] = [
  ['Linked lists', 'linked-lists'],
  ['Recursion', 'recursion'],
  ['Quicksort', 'quicksort'],
  ['Big-O', 'big-o'],
  ['Arrays vs. linked lists', 'arrays-vs-linked-lists'],
  ['Stacks', 'stacks'],
]
