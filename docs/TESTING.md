# TraceDS — Testing Specification

Tests are written **before** the implementation for every milestone. This
document maps each milestone to the tests that must **fail first, for the
stated reason**, and then pass.

Related: [EXERCISES.md](EXERCISES.md) ·
[ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. Tooling

| Layer | Tool | Command |
|---|---|---|
| Engine, viz pure functions, analytics client, content | Vitest (`node` env by default; `jsdom` only where DOM is needed) | `cd frontend && npm test` (`vitest run`) |
| Types / lint | `tsc -b` (app, node, and tests projects) / oxlint | `npm run typecheck` / `npm run lint` |
| React components | Vitest + React Testing Library + user-event + jest-dom | same |
| Go handlers / validation | `go test` + `net/http/httptest` + `store.Memory` fake | `cd backend && go test ./...` |
| Go Postgres store, migrations, analytics queries | `go test` against real Postgres (build tag `integration`, `TEST_DATABASE_URL`) | `go test -tags=integration ./...` |
| End-to-end | Playwright (Chromium + WebKit mobile profile), against `vite preview` | `cd frontend && npx playwright test` |

The CI workflow runs all of these on every push (ARCHITECTURE §11).

## 2. TDD procedure (every milestone)

1. Write the milestone's tests (§4) **first**.
2. Add the **minimal stubs** needed for the tests to compile: exported
   functions and types whose bodies are `throw new Error('not implemented')`,
   or for Go `panic("not implemented")` / `http.NotFound`. This makes tests
   fail on *assertions or not-implemented errors*, not on import or compile
   errors. A failure for an unexpected reason (typo, bad import) doesn't count
   as red.
3. Run the tests and confirm they **fail for the expected reason** listed in
   §4. Paste a summary of the failing output into the milestone notes or
   commit message.
4. Implement the minimum needed to pass.
5. Run the milestone's tests → green.
6. Run **all** tests: frontend unit, backend unit, and E2E once it exists →
   green.
7. Each milestone requires review and acceptance before proceeding to the
   next milestone.

Tests may not be weakened, skipped (`.skip`, `t.Skip`), or deleted to get to
green. If a test is wrong, fix it in a separate, explained change.

## 3. Conventions

- Test files mirror source paths: `src/engine/engine.ts` →
  `tests/engine/engine.test.ts`. Go tests sit next to their code
  (`*_test.go`).
- **Content-driven tests** are table-driven over the exercise data and run
  against the *real* content files. Every incorrect choice in every exercise
  is exercised automatically. Adding content adds test cases for free.
- **Named tests** for headline misconceptions (EXERCISES "Named cases") exist
  in addition to the table-driven tests, so a regression has a readable name.
- **Fixtures:** `tests/fixtures/miniExercise.ts` is a hand-written 3-checkpoint
  exercise used for engine tests, so engine tests don't depend on real
  content.
- Prefer RTL queries by role and accessible name (`getByRole('radio', { name:
  /head refers/ })`). Test ids are a last resort.
- Visualization assertions use the pure `layout()`/`describe()` outputs where
  possible, and the DOM only for rendering concerns.

## 4. Milestone → test map

For each milestone: the tests to write first, the **expected red reason**,
and the green criteria.

Sections are listed in the **execution order** (M0–M4, M7–M10, then M5–M6). M5 and M6
run after launch (M10).

### M0 — Specification
No code tests. Gate: human review of the docs.

### M1 — Exercise domain model and deterministic engine
Files: `tests/engine/engine.test.ts`, `tests/engine/validate.test.ts`,
`tests/fixtures/miniExercise.ts`, `tests/architecture/imports.test.ts`,
`tests/content/catalog.test.ts`.

**Expected red:** `startRun`/`submitAnswer`/`continueRun`/`restartRun`/
`validateExercise` throw "not implemented". The catalog-transcription tests
fail on assertions while `content/catalog.ts` is an empty stub. A1 is green
from the start, because the stubs are already pure; it guards against
regressions.

| # | Test | Asserts |
|---|---|---|
| E1 | initializes at step 0 | `stepIndex 0`, `phase 'question'`, `attempt 0`, `feedback null`, `results []`, `state` deep-equals `initialState` |
| E2 | initial state not shared | mutating `run.state` doesn't affect `exercise.initialState` |
| E3 | correct answer advances exactly one step | `stepIndex` 0→1, `phase 'explanation'`, outcome `correct`, `attempt 1` |
| E4 | resulting state matches spec | `run.state` deep-equals `checkpoints[0].resultState`; `previousState` equals the prior state |
| E5 | incorrect answer does not advance | `stepIndex`, `state`, `phase` unchanged |
| E6 | incorrect answer produces the matching hint | feedback `{kind:'incorrect', misconceptionId, hint}` matches the choice's misconception; the correct choice id never appears in the feedback |
| E7 | retry works | wrong then correct → advances; `outcome.attempt === 2`; `results[0].attempts === 2`, `hintsShown` has 1 id |
| E8 | eliminated choice cannot be resubmitted | outcome `rejected/already-eliminated`; attempt count unchanged |
| E9 | unknown choice rejected | outcome `rejected/unknown-choice`; run unchanged |
| E10 | submit rejected during explanation | outcome `rejected/not-in-question-phase` |
| E11 | continue moves explanation → question | feedback cleared, `attempt 0`, `eliminated []` |
| E12 | continue is a no-op in question phase | run returned unchanged |
| E13 | final step completes exercise | last correct → `exerciseCompleted: true`, `stepIndex === n`; continue → `phase 'complete'` |
| E14 | completion flagged exactly once | across a whole golden run, exactly one outcome has `exerciseCompleted: true` |
| E15 | cannot advance beyond completion | in `complete`: submit → rejected, continue → unchanged, `stepIndex` stays n |
| E16 | restart restores initial state | after progress and wrong answers, `restartRun` deep-equals a fresh `startRun` |
| E17 | determinism | the same sequence of inputs on two runs gives deep-equal runs |
| E18 | unchanged-state checkpoint allowed | fixture checkpoint with `resultState` equal to the prior state advances normally |
| V1–V15 | malformed exercises rejected | one test per malformation (covering every rule) in ARCHITECTURE §4.4: missing id; zero checkpoints; duplicate checkpoint id; bad checkpoint id format; < 2 or > 4 choices; duplicate choice id; `correctChoiceId` not in choices; correct choice has misconception; incorrect choice missing hint; line out of range / empty lines; dangling ref target; duplicate object id; malformed Node fields; **mixed terminology sets** (a `generic-node` exercise with a `digit` field or a BigNum object, or a `bignum-node` exercise with a `data` field); unknown concept/misconception id. Each asserts `ok: false` and a specific error message substring |
| V16 | valid fixture accepted | `ok: true`. The fixture includes an `unspecified` field value, which is accepted |
| A1 | engine purity | static scan of `src/engine/**`: only sibling `./` imports (so no `react`, `viz`, `analytics`, `content`, or packages), and no `Date`, `Math.random`, `crypto`, `fetch`, storage, DOM, timers, or `async`/`Promise`. The oxlint `no-restricted-imports` override enforces the same import boundary at lint time |
| CAT | catalog transcription | `content/catalog.ts` concepts and misconceptions equal the EXERCISES.md §0.4/§0.5 tables (parsed from the doc), in order, unique |

### M2 — Linked-list visualization
Files: `tests/viz/layout.test.ts`, `tests/viz/diff.test.ts`,
`tests/viz/describe.test.ts`, `tests/viz/LinkedListView.test.tsx`.

**Expected red:** `layout`/`diff`/`describe` throw "not implemented";
`LinkedListView` renders nothing.

| # | Test | Asserts |
|---|---|---|
| L1 | empty list | no objects, no variables → zero nodes/edges; describe says "No variables yet" |
| L2 | `head → null` | variable pill plus a null marker; edge head→null; describe "head is null" |
| L3 | one-node list | one node `[4 | null]` with terminator; head pill above it |
| L4 | multiple-node list | nodes in list order with increasing x on the same row; `next` edges A→B→C; C→null terminator |
| L5 | correct next relationships | each `next` ref produces exactly one edge, from source handle `next` to the target node; no extra edges |
| L6 | head reference | head pill is positioned over the first node, with an edge from the pill to it |
| L7 | temporary references | `cur` on a middle node gets a pill over that node; the list's row and order are unchanged |
| L8 | multiple references to one node | `head` and `cur` on the same node → two pills stacked without overlapping bounding boxes |
| L9 | two next fields into one node | (hand-built state: A→B and D→B) two edges target B; D placed on its own row |
| L10 | unreachable node | (LL-03 after c3) B flagged `unreachable`, on the last row; describe mentions it |
| L11 | BigNum object | (LL-04) BigNum box with `myHead`/`mySize`; a hand-built `myHead → null` renders a null marker |
| L12 | deep copy rows | (LL-04 final) original and copy on separate rows; no edge from the copy's nodes to the original's nodes |
| L13 | cycle safety | a hand-built cyclic state terminates and places each node once |
| L14 | layout determinism | same state → deep-equal layout |
| L15 | variable removal | a variable missing from the frame → no pill (LL-02 after c8) |
| L16 | field labels from state | a Node with field `digit` shows the caption `digit`, never `data` |
| L17 | unspecified reference | (LL-04 after c1) `Y.myHead → ?` renders a dashed `?` marker with **no edge** and no null marker. describe() says "not shown in this exercise". A diff from `?` to a ref (c3) is reported as a change |
| D1–D4 | diff (state transitions) | changed `next` field, changed `data`, changed variable target, added/removed object are each reported; identical states → empty ChangeSet |
| R1 | component renders supplied state | given state, renders node text `4`, `7`, `null` and the sr-only description |
| R2 | state transition re-render | rerender with the next state updates the description and adds `data-changed` on changed elements |
| R3 | no business logic in viz | static import scan: `src/viz/**` imports only `engine/types` |

### M3 — LL-01 and LL-02 (and the exercise screen)
Files: `tests/content/ll01.test.ts`, `tests/content/ll02.test.ts`,
`tests/content/contentTable.test.ts`, `tests/screens/ExerciseScreen.test.tsx`,
`tests/screens/Landing.test.tsx`, `e2e/exercise-flow.spec.ts`.

**Expected red:** the content modules export nothing or a placeholder that
fails validation; screens are missing.

| # | Test | Asserts |
|---|---|---|
| C1 | content validates | `validateExercise` ok for LL-01, LL-02 |
| C2 | golden path | LL-01 `b,c,d,a,d,c`; LL-02 `b,a,b,c,a,b,c,b` complete with all first-try correct |
| C3 | every result state matches spec | for each checkpoint, `resultState` deep-equals a fixture hand-transcribed from EXERCISES.md (a second, independent transcription catches data-entry errors) |
| C4 | table-driven wrong answers | for every incorrect choice: no advance, the exact misconception id and hint, then the correct answer advances with `attempt = 2` |
| C5 | named cases | the named cases listed in EXERCISES.md for LL-01 and LL-02 |
| C6 | terminology lint | (a) No content string contains `ListNode`, `getNext`, `setNext`, `.val`, or `.value`. (b) Every identifier declared or accessed in the Java `code` lines belongs to the exercise's terminology set (EXERCISES §0.6) or is a Java keyword, a literal, `this`, or `System.out.println`. Invented names like `temp`, `newNode`, `count`, or `current` fail. (c) No sets are mixed: `generic-node` exercises never mention `digit`, `myHead`, `mySize`, or `BigNum`, and `bignum-node` exercises never mention a `data` field. English prose in hints is otherwise allowed |
| C7 | step-id permanence | snapshot of all `[exerciseId, stepId, correctChoiceId]` tuples. Changing one requires a deliberate snapshot update |
| S1 | screen: question renders | code with the highlighted line (`aria-current="step"`), a radio group with the choices, Check disabled until a choice is selected |
| S2 | screen: wrong answer | "Not quite" text and the hint appear; the choice is disabled; the viz description is unchanged |
| S3 | screen: correct answer | "Correct" plus the explanation; the viz description changes to the result state; focus is on Continue |
| S4 | screen: completion | after the final Continue, the completion summary shows steps, first-try count, and hints |
| S5 | screen: restart | Restart returns to step 1 with the initial description |
| S6 | keyboard only | complete one checkpoint using only Tab/Arrow/Space/Enter |
| S7 | correctness not color-only | feedback has text and an icon with an accessible name |
| P1 | E2E golden flow (desktop + mobile profiles) | landing → select Linked Lists → start LL-01 → submit wrong → hint visible → retry → correct → viz updates → … → completion screen |

### M4 — LL-03 and LL-04
Files: `tests/content/ll03.test.ts`, `tests/content/ll04.test.ts` (C1–C7
applied to LL-03/LL-04, plus C8–C12), `e2e/ll04-deep-copy.spec.ts`.

**Expected red:** content missing or failing validation.

Additional:
| # | Test | Asserts |
|---|---|---|
| C8 | LL-04 deep-copy invariant | in the final state, the node-id sets reachable from `X.myHead` and from `Y.myHead` are disjoint, and their digit sequences are equal |
| C9 | LL-04 `shallow-head` named test | `ll04-c3` choice `a` → `shallow-head` hint |
| C10 | LL-03 unreachable then removed | B unreachable after c3 (via the viz reachability helper); absent from the heap after c4 |
| C11 | course code verbatim | LL-04 `code` equals the course `clone()` from EXERCISES LL-04 line for line, and LL-02 `code` equals the course traversal (comparison against fixture strings) |
| C12 | no unsupported BigNum claims | LL-04 strings contain none of "most significant", "least significant", or "empty BigNum", and no multi-digit number formed from the digits (such as "472"). `copy.myHead` is `unspecified` after c1 and c2 (A2, A4, A5) |
| P2 | E2E LL-04 | complete LL-04 including one `shallow-head` wrong attempt; the copy row is visible |

### M7 — Backend and PostgreSQL analytics
Go files: `internal/api/*_test.go`, `internal/store/postgres_test.go`
(integration), `internal/store/queries_test.go` (integration).
Frontend files: `tests/analytics/*.test.ts`,
`tests/screens/ExerciseScreen.analytics.test.tsx`,
`e2e/analytics-offline.spec.ts`.

**Expected red:** handlers return 404 or 501; store methods panic "not
implemented"; the analytics client functions are stubs.

| # | Test | Asserts |
|---|---|---|
| B1 | health | `GET /api/v1/health` → 200 `{status:"ok"}`; `database:"unavailable"` when Ping fails |
| B2 | anonymous session creation | POST valid → 201; repeat → 200; row exists |
| B3 | session validation | bad UUID → 400; unknown field (e.g. `email`) → 400 |
| B4 | events recorded correctly | a valid batch → 202 `{accepted:n}`; stored rows match each field |
| B5 | events upsert session | events for an unknown session id → 202 and the session row is created |
| B6 | event idempotency | the same `event_id` twice → one row |
| B7 | event validation | unknown `event_type`, missing R field, present — field, attempt 0 or 11, bad id pattern, > 50 events, body > 64 KiB → 400 |
| B8 | no PII required | every endpoint succeeds with only the documented fields; request structs contain no name/email/student-id fields; unknown `name`/`email` fields → 400 |
| B9 | CORS | allowed origin → ACAO header set; other origin → no header; OPTIONS preflight → 204 |
| B10 | method routing | wrong method → 405 |
| Q1–Q7 | launch queries | seed fixed events, run each ANALYTICS §6 query, assert exact numbers |
| M-1 | migration applies | `0001_init.sql` applies cleanly to an empty DB; RLS is enabled on all three tables |
| F-A1 | session id persisted | the first call generates and stores the id; the second call returns the same id |
| F-A2 | storage unavailable | `localStorage` throws → an in-memory id, no throw |
| F-A3 | attempt numbers correct | the screen emits `answer_submitted` with `attempt_number` 1, 2 for wrong→right, and resets to 1 on the next step and on restart |
| F-A4 | completion recorded once | a golden run emits exactly one `exercise_completed`; restart plus a second completion emits a second one with a different `run_id` |
| F-A5 | event payload shape | each event type carries exactly its R/O fields per ANALYTICS §3 |
| F-A6 | hint_shown paired with incorrect | each incorrect submission emits one `hint_shown` with the matching misconception and concept |
| F-A7 | batching and flush | 10 events trigger a flush; the timer flushes; page-hide flushes with `keepalive` |
| F-A8 | retry then drop | 5xx retried twice then dropped; 4xx dropped immediately; no unhandled rejections |
| F-A9 | analytics failure does not break learning | the analytics client throws synchronously on every call → the full LL-01 golden path still completes in RTL |
| F-A10 | no-op without base URL | `VITE_API_BASE_URL` unset → no fetch calls |
| P3 | E2E offline analytics | Playwright `route('**/api/**', r => r.abort())` → complete LL-01 end to end, with no error UI |
| P4 | E2E slow analytics | API responds after 10 s → answer feedback still appears in < 200 ms |

### M8 — Feedback survey
Files: `tests/components/FeedbackForm.test.tsx`, Go `feedback_test.go`,
`e2e/feedback.spec.ts`.

**Expected red:** form missing; handler returns 501.

| # | Test | Asserts |
|---|---|---|
| FB1 | helpfulness required | Submit is disabled until a 1–5 rating is chosen; the radios are labelled |
| FB2 | optional fields | topic select (ANALYTICS §5 enum), comments textarea with a 2000-char limit and the no-PII notice visible |
| FB3 | submit | POST body has exactly `session_id, helpfulness, requested_topic?, comments?`; `survey_submitted` is emitted; the "Thanks" state is shown |
| FB4 | failure tolerated | POST fails → still shows "Thanks" (no error blocking); no retry loop |
| FB5 | single submission | double click → one POST |
| FB6 | backend validation | helpfulness 0 or 6 → 400; unknown topic → 400; comments > 2000 → 400; valid → 201 and a row |
| FB7 | dismissible | the survey can be skipped; Next exercise works without submitting |

### M9 — Production polish and accessibility
Files: `e2e/a11y.spec.ts` (with `@axe-core/playwright`, a dev dependency
justified by automating WCAG checks; approved Q9),
`e2e/responsive.spec.ts`, plus component tests for any new polish.

**Expected red:** at least one axe violation or a layout assertion failing
before the polish work.

| # | Test | Asserts |
|---|---|---|
| X1 | no serious/critical axe violations | landing, module, exercise (question, wrong, correct states), completion |
| X2 | keyboard E2E | the full LL-01 flow with the keyboard only |
| X3 | visible focus | focused elements have a non-none outline (computed style) |
| X4 | desktop side-by-side | at 1280×800, the code panel and viz bounding boxes are horizontally adjacent and both in the viewport |
| X5 | mobile stack, no horizontal scroll | at 390×844, `scrollWidth <= clientWidth`; order is code → viz → question |
| X6 | reduced motion | under `prefers-reduced-motion`, transition durations are 0 |
| X7 | malformed content graceful | a corrupted exercise route shows "This exercise is unavailable" and a link home |
| X8 | unknown route | `#/x/NOPE` → friendly not-found with a link home |
| X9 | bundle budget | `vite build` main JS gzip ≤ 250 KB (scripted check in CI) |

### M10 — Deployment and production smoke tests
Files: `e2e/smoke.prod.spec.ts` (run with `BASE_URL`/`API_URL` env against
the deployed URLs), `scripts/smoke.sh` (curl).

**Expected red:** run against the not-yet-deployed URLs → connection failure.

| # | Test | Asserts |
|---|---|---|
| SM1 | API health | `GET $API_URL/api/v1/health` → 200 with `database:"ok"` |
| SM2 | CORS from prod origin | preflight from the Vercel origin is allowed |
| SM3 | session and event round-trip | POST a session and an event with a `smoke-` prefixed module id → 201/202; verify the row via SQL, then delete smoke rows |
| SM4 | frontend loads | `BASE_URL` renders the landing page in < 3 s; no console errors |
| SM5 | prod golden path | complete LL-01 on production (desktop and mobile profile) |
| SM6 | prod offline resilience | same as P3 against prod with the API blocked |

### M5 — Recursion visualization
Files: `tests/viz/recursion/*.test.ts(x)`. Final cases are defined when the
recursion content arrives. Minimum:
- R-V1 single frame renders the method name and locals.
- R-V2 multiple frames render in stack order, with the top frame emphasized
  and marked as current for assistive tech.
- R-V3 a frame push and a frame pop are each detected by `diff`.
- R-V4 the optional `returnValue` annotation renders.
- R-V5 linked-list rendering is unaffected (the M2 suite still passes).
- R-V6 `src/viz/recursion/**` does not import `@xyflow/react` (Q6: plain React
  components).

**Expected red:** renderer is missing.

### M6 — REC-01 and REC-02
Same C1–C7 pattern as M3 for the recursion content, plus an E2E recursion
flow. These tests are written only after the recursion content is approved in
EXERCISES.md.

## 5. Coverage of required test lists

| Required (from brief) | Covered by |
|---|---|
| Engine: initializes at step 0 | E1 |
| correct answer advances exactly one step | E3 |
| incorrect answer does not advance | E5 |
| incorrect answer produces appropriate hint | E6, C4 |
| retry works | E7, C4 |
| resulting state matches specification | E4, C3 |
| final step completes exercise | E13 |
| cannot advance beyond completion | E15 |
| restart restores initial state | E16, S5 |
| malformed exercises are rejected | V1–V15, X7 |
| Viz: empty list / one-node / multiple-node | L1 / L3 / L4 |
| null reference | L2, L11 |
| multiple references to one node | L8, L9 |
| correct next relationships | L5 |
| head reference | L6 |
| temporary references | L7 |
| state transitions | D1–D4, R2 |
| Analytics: anonymous session creation | B2, F-A1 |
| events recorded correctly | B4, F-A5 |
| attempt numbers correct | F-A3 |
| exercise completion recorded once | E14, F-A4, B6 |
| no PII required | B3, B8 |
| analytics failure does not break learning | F-A9, P3, P4, SM6 |
| E2E: landing → … → completion screen | P1, SM5 |
