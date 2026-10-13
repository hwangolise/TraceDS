# TraceDS — Analytics Specification

Anonymous, aggregate, best-effort learning analytics. This document defines
**what** is recorded, **when**, and **how we answer the launch questions**.

Related: [ARCHITECTURE.md §8–§10](ARCHITECTURE.md) · [EXERCISES.md §0.4–0.5](EXERCISES.md)

---

## 1. Principles

1. **Never block learning.** Analytics is fire-and-forget. Every failure is
   swallowed (ADR-7).
2. **No PII.** We don't collect names, emails, student IDs, IP addresses,
   precise device fingerprints, or free text, except the optional feedback
   comment, which carries an explicit "don't include personal info" notice.
3. **Fixed vocabulary.** The event types and fields are listed below. The
   backend rejects unknown fields and unknown event types.
4. **Idempotent delivery.** Each event has a client-generated `event_id`, so
   retries never double-count.
5. **Engine-driven.** Learning events are emitted from engine `Outcome`s, not
   from ad-hoc UI handlers, so counts match engine semantics exactly.

## 2. Identifiers

| Id | Generated | Lifetime | Purpose |
|---|---|---|---|
| `session_id` | `crypto.randomUUID()` on first visit | Persisted in `localStorage['traceds.sessionId']` (in-memory fallback) | Anonymous person-proxy (really a browser profile) |
| `run_id` | New UUID at every `startRun`/`restartRun` | One pass through one exercise | Distinguishes restarts; makes "completed once" well-defined |
| `event_id` | New UUID per event | — | Idempotency key (`events.id`) |

## 3. Event catalog

All events carry: `event_id`, `event_type`, `client_ts` (ISO-8601), and the
`session_id` sent with the batch. The columns listed per event are required
(R), optional (O), or must be absent (—).

| event_type | When emitted (exactly) | module_id | exercise_id | run_id | step_id | choice_id | correct | attempt_number | concept_id | misconception_id |
|---|---|---|---|---|---|---|---|---|---|---|
| `session_started` | Once per page load, after the session id is resolved | — | — | — | — | — | — | — | — | — |
| `module_selected` | User opens `#/m/<module>` (navigation, not re-render) | R | — | — | — | — | — | — | — | — |
| `exercise_started` | `startRun` / `restartRun` creates a run (incl. restart) | R | R | R | — | — | — | — | — | — |
| `answer_submitted` | Every outcome of type `correct` or `incorrect` (not `rejected`) | R | R | R | R | R | R | R | R | O (R when incorrect) |
| `hint_shown` | Every `incorrect` outcome (the hint is displayed immediately) | R | R | R | R | R | — | R | R | R |
| `exercise_completed` | The single outcome with `exerciseCompleted: true` in a run | R | R | R | — | — | — | — | — | — |
| `survey_submitted` | Feedback POST was *attempted* from the survey form | O | O | — | — | — | — | — | — | — |

Notes:
- `attempt_number` is 1-based per checkpoint per run. First submission is 1.
  It resets to 1 at each new checkpoint and on restart (new `run_id`).
- `hint_shown` is redundant with incorrect `answer_submitted` today. It exists
  as a separate event so hint *display* stays countable if hint policy changes
  (e.g. delayed hints), and because the launch questions name it.
- `exercise_completed` is emitted once per `run_id`. A student who restarts
  and finishes again produces a second completion with a different `run_id`.
  "Completed an exercise" metrics count `DISTINCT session_id`.
- `survey_submitted` is an event *in addition* to the `feedback` row, so survey
  reach can be measured even if the feedback insert fails validation.

### Validation (backend, per event)

- `event_type` must be one of the seven types above.
- Ids (`module_id`, `exercise_id`, `step_id`, `choice_id`, `concept_id`,
  `misconception_id`) must match `^[A-Za-z0-9_-]{1,64}$`.
- `attempt_number` must be in 1–10. `correct` must be a boolean.
- R/— rules from the table are enforced. A missing R field or a present —
  field returns 400.
- UUID fields must parse as UUIDs.
- The backend **does not** verify ids against the content catalog. Content
  lives in the frontend, and keeping them coupled isn't worth it in V1.

## 4. Delivery semantics

- Batches of 1–50 events. The client flushes when the queue has 10 events,
  every 5 s, or on page hide.
- Retry at most 2 times with backoff (1 s, 3 s) on network or 5xx errors.
  Drop on 4xx.
- **At-most-once user-visible effect, at-least-once attempt, deduplicated by
  `event_id`.**
- If `/sessions` fails, `/events` still succeeds, because the events endpoint
  upserts the session.
- Expected loss: events queued in a tab that is killed before flush. This is
  accepted.

## 5. Feedback (`feedback` table)

Shown on the completion screen. It is optional and can be dismissed. Submitted
at most once per completion screen view.

| Field | Type | Constraint |
|---|---|---|
| `helpfulness` | 1–5 | required. Prompt: "How helpful was this for your exam prep?" |
| `requested_topic` | enum, optional | `double-ended-lists`, `circular-lists`, `doubly-linked-lists`, `big-o`, `quicksort`, `stacks`, `recursion`, `other` |
| `comments` | text, optional | ≤ 2000 chars. The UI shows "Please don't include your name, email, or student ID." |

## 6. Launch questions → queries

Each query must have a matching integration test that seeds known events and
asserts the result (TESTING.md, M7). Results are run ad hoc in the Supabase SQL
editor. There is no dashboard in V1.

**Q1. How many students started?**
```sql
select count(distinct session_id) from events where event_type = 'exercise_started';
```
(`count(*) from sessions` = visitors, including people who never started.)

**Q2. How many completed an exercise?**
```sql
select count(distinct session_id) from events where event_type = 'exercise_completed';
```

**Q3. Which exercises were completed (and by how many)?**
```sql
select exercise_id, count(distinct session_id) as students, count(*) as completions
from events where event_type = 'exercise_completed'
group by exercise_id order by exercise_id;
```

**Q4. Which steps produced the most incorrect first attempts?**
```sql
select exercise_id, step_id,
       count(*) filter (where not correct)                    as wrong_first,
       count(*)                                               as first_attempts,
       round(100.0 * count(*) filter (where not correct) / count(*), 1) as pct_wrong
from events
where event_type = 'answer_submitted' and attempt_number = 1
group by exercise_id, step_id
order by pct_wrong desc, wrong_first desc;
```

**Q5. Which concepts (and misconceptions) generated the most hints?**
```sql
select concept_id, misconception_id, count(*) as hints
from events where event_type = 'hint_shown'
group by concept_id, misconception_id order by hints desc;
```

**Q6. What percentage completed an entire module?**
Module membership is fixed in content. For V1 linked lists it is
`LL-01..LL-04`.
```sql
with per_session as (
  select session_id, count(distinct exercise_id) as done
  from events
  where event_type = 'exercise_completed' and module_id = 'linked-lists'
  group by session_id
), starters as (
  select count(distinct session_id) as n from events
  where event_type = 'exercise_started' and module_id = 'linked-lists'
)
select round(100.0 * count(*) filter (where done = 4) / nullif((select n from starters), 0), 1)
       as pct_completed_module
from per_session;
```

**Q7. What topics do students request next?**
```sql
select requested_topic, count(*) from feedback
where requested_topic is not null group by requested_topic order by count(*) desc;
```

Supporting: helpfulness distribution
`select helpfulness, count(*) from feedback group by 1 order by 1;`
and mobile share
`select viewport, count(*) from sessions group by 1;`.

## 7. Client emission points (frontend)

| Where | Emits |
|---|---|
| `main.tsx` after `getSessionId()` | `POST /sessions`, then `session_started` |
| Module screen mount on route entry | `module_selected` |
| `ExerciseScreen` on `startRun`/`restartRun` | `exercise_started` (new `run_id`) |
| `ExerciseScreen` after `submitAnswer` | `answer_submitted`; plus `hint_shown` if incorrect; plus `exercise_completed` if `exerciseCompleted` |
| Feedback form submit | `POST /feedback`, then `survey_submitted` |

`rejected` outcomes emit nothing.
