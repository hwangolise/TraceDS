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
   functions and types whose bodies are `throw new Error('not implemented')`.
   For Go, return an explicit `errors.New("not implemented")` or a 501
   response rather than panicking, because a panic aborts the whole test
   binary and hides the rest of the red run (approved in M7A). This makes tests
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
`tests/viz/describe.test.ts`, `tests/viz/LinkedListView.test.tsx`,
`tests/architecture/viz-imports.test.ts` (R3), `tests/dev/notation.test.ts`
(the parser that supplies EXERCISES.md states to these tests), plus
`tests/fixtures/states.ts` and `tests/setup/dom.ts` (React Flow jsdom stubs).

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
| L18 | every spec state renders legibly | for all 30 EXERCISES.md LL states: boxes inside bounds, no two boxes overlap, and `fitScale(600×400) ≥ MIN_SCALE` |
| N | notation parser | parses all 30 LL states; each is well-formed under the M1 validator with the right terminology set; spot checks against hand-written states |
| T | text description | exact wording for empty, null, one node, temporary reference, BigNum, unspecified, unreachable, output, cycles, and multiple frames; deterministic; never mentions internal ids |
| D1–D4 | diff (state transitions) | changed `next` field, changed `data`, changed variable target, added/removed object are each reported; identical states → empty ChangeSet |
| R1 | component renders supplied state | given state, renders node text `4`, `7`, `null` and the sr-only description |
| R2 | state transition re-render | rerender with the next state updates the description and adds `data-changed` on changed elements |
| R3 | no business logic in viz | static import scan: `src/viz/**` imports only `engine/types` |

### M3 — LL-01 and LL-02 (and the exercise screen)
Files: `tests/content/ll01.test.ts`, `tests/content/ll02.test.ts`,
`tests/content/contentTable.test.ts`, `tests/screens/ExerciseScreen.test.tsx`,
`tests/screens/App.test.tsx` (landing, module, flow, completion, re-entry;
replaces the planned `Landing.test.tsx`), `tests/screens/navigation.test.ts`
(router, modules, next exercise, completion storage),
`tests/components/javaTokens.test.ts`, `tests/architecture/ui-logic.test.ts`
(U1: the UI never reads `correctChoiceId` or misconceptions; its analytics
boundary was redefined in M7), and
`e2e/exercise-flow.spec.ts` (P1, plus a page-level no-horizontal-scroll check).
Verbatim checks read the doc via `tests/fixtures/docContent.ts`.

E2E runs Chromium at 1440×900 (desktop) and Pixel 7 emulation (mobile).
Locally it uses the installed Google Chrome (`channel: 'chrome'`); CI installs
Playwright's Chromium. A WebKit mobile profile is deferred to M9.

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
applied to LL-03/LL-04 through `contentTable.test.ts`, plus C8–C12 and
hand-written state checks for insertion, reference movement, bypass,
unreachable, `newPtr`/`origPtr`, and `unspecified`), updates to `App.test.tsx`,
`navigation.test.ts`, and `ExerciseScreen.test.tsx` for four playable
exercises, `e2e/ll04-deep-copy.spec.ts` (P2), and `e2e/diagram-fit.spec.ts`
(diagram fits after transitions on desktop; the swipe note on phones), both
added after visual review.

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
HTTP scope: `GET /api/v1/health`, `POST /api/v1/sessions`, `POST /api/v1/events`
only. `POST /api/v1/feedback` was added in M8 (FB1–FB7).

Go files: `internal/api/*_test.go` (B1–B12, against `store.Memory`),
`internal/store/migrations_test.go` (M-1..M-6), `internal/store/postgres_test.go`
(PG1–PG7), `internal/store/queries_test.go` (Q1–Q7). The last three are
integration tests (`-tags=integration`, `TEST_DATABASE_URL`), and each test
gets its own throwaway schema (`testdb_test.go`).
Frontend files: `tests/analytics/{session,client,bootstrap}.test.ts(x)`,
`tests/screens/ExerciseScreen.analytics.test.tsx`,
`tests/screens/App.analytics.test.tsx`,
`tests/architecture/{ui-logic,analytics-imports}.test.ts` (U1, F-A14),
`tests/fixtures/analyticsWire.ts` (fetch stub plus page-hide flush; tests
observe the network boundary), `e2e/analytics-offline.spec.ts` (P3, P4). The
E2E build sets `VITE_API_BASE_URL` to a closed local port, so P3/P4 exercise
real analytics.

**Expected red:** the router returns 501; store methods return "not
implemented" errors; the migration is an empty placeholder; the analytics
modules throw "not implemented" and nothing is wired. **Legitimate early
green:** B11, U1, and F-A14 (static regression guards).

| # | Test | Asserts |
|---|---|---|
| B1 | health | `GET /api/v1/health` → 200 exactly `{status:"ok",database:"ok"}`; `database:"unavailable"` (still 200) when Ping fails |
| B2 | anonymous session creation | POST valid → 201 `{session_id}`; repeat → 200; exactly one row; only `session_id` is enough; a repeat never overwrites known metadata |
| B3 | session validation | malformed/empty/array/null body, missing/empty/bad UUID, **invalid viewport**, wrong types, unknown or PII fields → 400 with the error envelope, nothing stored; body > 64 KiB → **413** with the envelope (a 60 KiB control → 201) |
| B4 | events recorded correctly | each type accepted with only its R fields; O fields accepted; stored rows match every field (incl. `client_ts`; `toISOString()`, no-fraction, and numeric-offset RFC 3339 accepted); events belong to the batch session; 50 events accepted; `{accepted:n}` = new rows; **batch order preserved** in storage |
| B5 | events upsert and session enrichment | events for an unknown session create it; a later `/sessions` → 200 and fills missing `app_version`/`viewport` without a second row; `/sessions→/events` and `/events→/sessions` converge to equal rows; known metadata is never replaced |
| B6 | event idempotency | the same batch twice → one row per event; identical retry → `{accepted:0}`; 2 duplicates + 1 new → `{accepted:1}`; a completion delivered 3× is stored once; the same `event_id` twice in one batch → one row, `{accepted:1}`; a stored `event_id` resent under another session → `{accepted:0}`, ownership unchanged |
| B7 | event validation | unknown/miscased `event_type`; each missing R field; each R field `null`; each present — field **and each — field set to `null`**; each O field set to `null`; `client_ts` missing, `null`, or malformed; bad UUIDs; attempt 0/11/−1/1.5/"1"; bad id patterns; unknown/PII fields; 0 or 51 events; one bad event → 400 and nothing stored; body > 64 KiB → **413** with the envelope |
| B8 | no PII required | every M7 endpoint succeeds with only documented fields; IP and user-agent headers are never stored |
| B9 | CORS | allowed origin → ACAO set; preflight → 204 with POST and Content-Type allowed; other origin (request or preflight) → no ACAO header, preflight not a 5xx (a positive control proves CORS is active); never `*` |
| B10 | routing and error envelope | wrong method → 405 and undocumented `/api/v1/*` paths → 404, **both with the error envelope**; paths outside `/api/v1` → 404 |
| B11 | no client-IP access | static scan: no non-test Go source references `RemoteAddr`, `X-Forwarded-For`, `X-Real-IP`, … |
| B12 | store failure | a failing store → 5xx with the envelope; the message does not leak driver, host, or SQL details |
| M-1 | migration applies | `0001_init.sql` applies to an empty schema; exactly `sessions`, `events`, `feedback`; RLS enabled on all three with no policies |
| M-2 | columns, no PII | exact columns and types per table (including `events.seq`); no PII-like column names |
| M-3 | keys | primary keys `id` on all three; FKs `events.session_id` and `feedback.session_id` → `sessions.id` |
| M-4 | NOT NULL and defaults | exact NOT NULL sets (incl. `events.seq` and `events.client_ts`); `created_at` defaults to `now()`; `feedback.id` defaults to a UUID; `seq` increases in insert order |
| M-5 | analytics indexes | `events_type_exercise_idx (event_type, exercise_id)`, `events_session_idx (session_id)`, `events_step_idx (step_id) WHERE event_type='answer_submitted'` |
| M-6 | invalid state rejected | FK, CHECK (event_type, attempt 1–10, viewport, helpfulness, comments ≤ 2000), NOT NULL (incl. missing `client_ts`), duplicate id → the specific SQLSTATE; boundary values accepted |
| PG1 | Ping | succeeds against a migrated database |
| PG2 | CreateSession upsert | created → true, repeat → false; known values kept; null values filled by a later call |
| PG3 | optional fields | absent metadata stored as NULL |
| PG4 | InsertEvents fields and order | every field preserved (read back with SQL); `order by seq` equals batch order within a batch and across *sequential* `InsertEvents` calls (server persistence order; cross-batch delivery order is not guaranteed, ANALYTICS §4) |
| PG5 | session upsert and enrichment | InsertEvents creates a missing session; keeps an existing one; a later CreateSession enriches it without changing `created_at`; both orders converge |
| PG6 | idempotency and count | returns new-row counts 1, 0, 1 for first delivery / identical retry / retry plus a new event; a duplicate id within one call is stored and counted once; an id already stored under another session → 0, ownership unchanged |
| PG7 | session ownership | events stored under the given session id |
| Q1–Q7 | launch queries | seed fixed events, run each ANALYTICS §6 query verbatim, assert exact numbers |
| U1 | UI boundary | screens/components/App never read `correctChoiceId` or misconceptions; import analytics only via `analytics/events` (and ModuleScreen/ExerciseScreen do import it, ANALYTICS §7); contain no fetch, `sendBeacon`, `XMLHttpRequest`, `keepalive`, `/api/v1`, `VITE_API_BASE_URL`, `traceds.sessionId`, `getSessionId`, `createAnalyticsClient`, or UUID generation (`randomUUID`, `getRandomValues`): `run_id` belongs to the analytics layer |
| F-A1 | session id persisted | first call generates and stores a UUID under `traceds.sessionId`; the second call and a reload return it; an existing id is reused |
| F-A2 | storage unavailable | `localStorage` reads, writes, or access throw → an in-memory UUID, stable for the page, no throw |
| F-A3 | attempt numbers correct | 1, 2, 3 on one checkpoint; reset to 1 on the next step and on restart; one run id per run |
| F-A4 | completion recorded once | emitted on the final correct answer (before Continue), once per run; restart and a second completion → a second event with a different `run_id` |
| F-A5 | event payload shape | the exact LL-01 sequence with handwritten values; keys ⊆ R∪O ⊇ R per type; no `null` values (irrelevant keys omitted); UUID `event_id`s; ISO `client_ts` |
| F-A6 | hint_shown paired with incorrect | each incorrect answer is followed by one `hint_shown` with the same step, choice, attempt, concept, and misconception |
| F-A7 | batching, flush, order | 10 events trigger a flush; the 5 s timer flushes; page hide flushes with `keepalive`; never an empty batch; 1–50 per request; tracked order preserved; undefined fields omitted |
| F-A8 | retry then drop | 5xx/network retried after 1 s and 3 s with an identical batch, then dropped; 4xx dropped immediately; no throws, no unhandled rejections |
| F-A9 | analytics failure does not break learning | LL-01 completes when fetch throws, rejects, or hangs, storage throws, or `crypto.randomUUID` throws (each also proves that path was used) |
| F-A10 | disabled without base URL | unset or empty `VITE_API_BASE_URL` → no fetch at all, learning works (client and app level, with a positive control) |
| F-A11 | session bootstrap | one `POST /sessions` with exactly `{session_id, app_version, viewport}`, then one `session_started`; viewport `narrow` at `innerWidth` 767 and `wide` at 768; stored id reused; app renders when the POST fails; one `session_started` under StrictMode |
| F-A12 | navigation events | `module_selected` on navigation and deep link, not on landing, re-render, or an unknown module; `exercise_started` per run; **no duplicates under React StrictMode** |
| F-A13 | no PII on the wire | no request body has name/email/student-id/IP/user-agent keys or the user-agent string |
| F-A14 | analytics boundary | `src/analytics/**` imports only analytics modules and `engine/types`; `client.ts`/`session.ts` are imported only by analytics modules and `main.tsx`; engine and viz never import analytics |
| P3 | E2E offline analytics | all `/api/**` aborted → LL-01 completes with no error UI or page errors; the API was demonstrably called |
| P4 | E2E slow analytics | API responds after 10 s → answer feedback appears in < 200 ms while slow requests are in flight |

### M8 — Feedback survey
Files: `tests/components/FeedbackForm.test.tsx`,
`tests/screens/CompletionScreen.feedback.test.tsx`,
`tests/architecture/feedback-boundary.test.ts`, Go `internal/api/feedback_test.go`,
`internal/store/feedback_test.go` (integration), `e2e/feedback.spec.ts`.

| # | Test | Asserts |
|---|---|---|
| FB1 | helpfulness required | Submit is disabled (with a visible reason) until a 1–5 rating is chosen; the radios are labelled; the scale endpoints are explained |
| FB2 | optional fields | topic select (six topics, ANALYTICS §5), comments textarea with a 2000-char limit, counter, and the no-PII notice |
| FB3 | submit | POST body has exactly `session_id, helpfulness, requested_topic?, comments?` (absent keys omitted, never null); the existing session id; `survey_submitted` is emitted; the "Thanks" state is shown |
| FB4 | failure tolerated | 4xx, 5xx, network error, or a 10 s hang → a restrained message, input kept, "Try again", no automatic retry, no unhandled rejection, completion state intact (**changed in M8**: no longer shows "Thanks" on failure) |
| FB5 | single submission | double click or repeated Enter → one POST |
| FB6 | backend validation | Go `feedback_test.go`: helpfulness bounds and type, session UUID, topic enum, comments length in characters, NUL, null, unknown and PII-like fields, 413, method, CORS, store failure and timeout, no IP/UA stored; integration: persistence, session creation, constraints, rollback, column set |
| FB7 | non-blocking | the survey is not a modal and follows the completion actions; Next exercise, Back, and Restart work with the survey untouched, half-filled, pending, or failed |
| FB-E1..E3 | Playwright | success path; API unavailable then practice another exercise; hung request does not block navigation |

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
| no PII required | B3, B8, M-2, F-A13 |
| analytics failure does not break learning | F-A9, P3, P4, SM6 |
| E2E: landing → … → completion screen | P1, SM5 |
