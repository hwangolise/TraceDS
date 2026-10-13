# TraceDS — Architecture

This document is the technical contract for TraceDS V1. It covers the system
shape, module boundaries, domain types, API, database schema, and the
decisions behind them.

Related: [PRODUCT.md](PRODUCT.md) · [EXERCISES.md](EXERCISES.md) ·
[ANALYTICS.md](ANALYTICS.md) · [TESTING.md](TESTING.md)

---

## 1. System overview

```
 ┌──────────────────────────── Browser (Vercel-hosted static SPA) ───────────────────────────┐
 │                                                                                           │
 │  content/  ──(typed data)──▶  engine/  ──(ExerciseRun, Outcome)──▶  screens/components/   │
 │  exercises                    pure TS                                 │          │        │
 │                               correctness +                           │          ▼        │
 │                               state transitions                       │      viz/         │
 │                                                                       │      pure mapping │
 │                                                                       │      + renderers  │
 │                                                                       ▼                   │
 │                                                              analytics/ (fire-and-forget) │
 └───────────────────────────────────────────────────────────────────────┬───────────────────┘
                                                                         │ HTTPS, JSON
                                                                         ▼
                                       ┌──────────── Go API on Cloud Run ─────────────┐
                                       │  POST /api/v1/sessions   POST /api/v1/events │
                                       │  POST /api/v1/feedback   GET  /api/v1/health │
                                       └───────────────────────┬──────────────────────┘
                                                               │ pgx (pooled)
                                                               ▼
                                              Supabase PostgreSQL: sessions, events, feedback
```

**The learning experience runs entirely in the browser.** The backend only
records anonymous analytics and feedback. If the backend, database, or
network is down, students can still complete every exercise.

---

## 2. Technology contract

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite | SPA, static build |
| Styling | Tailwind CSS | v4 via `@tailwindcss/vite` |
| Graph rendering | React Flow (`@xyflow/react`) | linked-list memory diagrams |
| Backend | Go, standard `net/http` | Go ≥ 1.22 for method-aware routing |
| DB driver | `github.com/jackc/pgx/v5` | the only Go runtime dependency planned |
| Database | PostgreSQL on Supabase | accessed **only** by the Go backend |
| Hosting | Vercel (frontend), Cloud Run (backend) | |
| Source / CI | GitHub, GitHub Actions | |
| Tests | Vitest, React Testing Library, `go test`, Playwright | |

**Explicitly excluded:** Next.js, GraphQL, Firebase, authentication, Redis,
microservices, LLM API calls, Redux, router libraries, syntax-highlighting
libraries, graph-layout libraries (dagre/elk), and ORMs.

A new dependency needs a written justification in the PR or commit message.
Changes to this table need explicit human approval.

### 2.1 Planned dependencies (complete list for V1)

Frontend runtime: `react`, `react-dom`, `@xyflow/react`.
Frontend dev: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`,
`@tailwindcss/vite`, `vitest`, `jsdom`, `@testing-library/react`,
`@testing-library/dom` (peer dependency of `@testing-library/react`),
`@testing-library/user-event`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `@playwright/test`, `@axe-core/playwright` (approved Q9, dev-only, M9),
`@types/*`, and `oxlint` (the linter shipped by the current Vite React-TS
template; it replaces the ESLint packages the template used to include).
Backend: `github.com/jackc/pgx/v5` only. UUID format validation uses a small
standard-library helper (regex); no UUID package.

---

## 3. Repository layout

```
/
├── README.md
├── docs/                     # this specification
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── content/          # exercise data (TS), modules.ts, nodeClasses.ts
│   │   ├── engine/           # types.ts, validate.ts, engine.ts — pure, no React
│   │   ├── viz/              # layout.ts, diff.ts, describe.ts (pure) + React renderers
│   │   │   ├── linkedlist/   # React Flow node/edge components
│   │   │   └── recursion/    # call-stack renderer (M5)
│   │   ├── analytics/        # session.ts, client.ts, events.ts
│   │   ├── components/       # CodePanel, QuestionPanel, FeedbackPanel, OutputPanel, …
│   │   ├── screens/          # Landing, Module, Exercise, Completion
│   │   ├── router.ts         # ~30-line hash router
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tests/                # Vitest unit/component tests (mirrors src/)
│   └── e2e/                  # Playwright specs
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/api/         # router, handlers, validation, CORS
│   ├── internal/store/       # Store interface, postgres.go, memory.go (test fake)
│   ├── migrations/           # 0001_init.sql, …
│   └── Dockerfile
└── .github/workflows/        # ci.yml
```

**Dependency direction (enforced by review, by the oxlint
`no-restricted-imports` override for `src/engine/**` in `.oxlintrc.json`, and
by the A1 static-scan test):**

```
content ──▶ engine/types
engine  ──▶ (nothing but its own types)
viz     ──▶ engine/types           (never engine.ts logic, never content)
analytics ─▶ (nothing app-specific except event types)
screens/components ──▶ engine, viz, analytics, content
```

`engine/` and the pure parts of `viz/` must not import React.

---

## 4. Domain model (frontend `engine/types.ts`)

These are the authoritative shapes. EXERCISES.md notation maps onto them 1:1.

### 4.1 Program state

```ts
export type ObjectId = string;                 // "A", "B", "X" — internal only

export type Value =
  | { kind: 'int'; value: number }
  | { kind: 'ref'; target: ObjectId | null }   // null = Java null
  | { kind: 'unspecified' };                   // value deliberately not claimed (EXERCISES §0.2)

export interface Field    { name: string; value: Value }   // ordered for rendering
export interface Variable { name: string; value: Value }

export interface HeapObject {
  id: ObjectId;
  type: 'Node' | 'BigNum';                     // extended per module, never free-form
  fields: Field[];                             // Node: [data|digit, next]; BigNum: [myHead, mySize]
}

export interface Frame {
  method: string;                              // "main", "clone()", later "fact(3)"
  variables: Variable[];                       // declared, in-scope variables only
}

export interface ProgramState {
  frames: Frame[];                             // bottom → top; LL exercises use exactly one
  heap: HeapObject[];
  output: string[];                            // printed lines, in order
}
```

`frames` is a list from day one, so recursion (M5) needs no breaking change.

`unspecified` exists so content never has to invent facts that course
material doesn't establish. Example: what `new BigNum()` stores in
`myHead` (LL-04). It is rendered as a dashed `?` and is never treated as
`null`.

### 4.2 Exercise content

```ts
export interface Choice {
  id: string;                                  // "a" | "b" | "c" | "d"
  text: string;
  misconception?: { id: string; hint: string } // required iff choice is incorrect
}

export interface Checkpoint {
  id: string;                                  // "ll01-c3" — permanent
  lines: number[];                             // 1-based lines highlighted
  focus?: string;                              // e.g. "cur != null"
  concept: string;                             // concept id, EXERCISES §0.4
  question: string;
  choices: Choice[];                           // 2–4, display order
  correctChoiceId: string;
  resultState: ProgramState;                   // full snapshot after this checkpoint
  explanation: string;
}

export interface Exercise {
  id: string;                                  // "LL-01"
  moduleId: string;                            // "linked-lists"
  title: string;
  objective: string;
  code: string[];                              // one entry per displayed line
  terminology: 'generic-node' | 'bignum-node'; // terminology set + Node class panel (EXERCISES §0.6)
  visualization: 'linked-list' | 'recursion';
  initialState: ProgramState;
  checkpoints: Checkpoint[];
}
```

**Why full snapshots, not diffs:** snapshots are trivial to author from
EXERCISES.md, trivial to assert in tests ("resulting state matches
specification" becomes a deep-equality check), and they make restart and
replay free. Diffs for highlighting changes are *derived* (`viz/diff.ts`).

### 4.3 Engine API (`engine/engine.ts`, pure functions, no I/O)

```ts
export type Phase = 'question' | 'explanation' | 'complete';

export interface StepResult { checkpointId: string; attempts: number; hintsShown: string[] }

export interface ExerciseRun {
  exerciseId: string;
  stepIndex: number;          // checkpoint being asked; === checkpoints.length once solved
  phase: Phase;
  state: ProgramState;        // current program state (rendered by viz)
  previousState: ProgramState | null;  // state before last transition (for diff highlight)
  attempt: number;            // submissions made on the current checkpoint
  eliminated: string[];       // wrong choice ids already tried on current checkpoint
  feedback: Feedback | null;
  results: StepResult[];
}

export type Feedback =
  | { kind: 'incorrect'; choiceId: string; misconceptionId: string; hint: string }
  | { kind: 'correct'; choiceId: string; explanation: string };

export type Outcome =
  | { type: 'incorrect'; checkpointId: string; choiceId: string; attempt: number;
      misconceptionId: string; concept: string }
  | { type: 'correct'; checkpointId: string; choiceId: string; attempt: number;
      concept: string; exerciseCompleted: boolean }
  | { type: 'rejected'; reason: 'not-in-question-phase' | 'unknown-choice' | 'already-eliminated' };

startRun(ex: Exercise): ExerciseRun
submitAnswer(ex: Exercise, run: ExerciseRun, choiceId: string): { run: ExerciseRun; outcome: Outcome }
continueRun(ex: Exercise, run: ExerciseRun): ExerciseRun
restartRun(ex: Exercise): ExerciseRun        // identical to startRun
validateExercise(input: unknown, catalog: Catalog): { ok: true; exercise: Exercise } | { ok: false; errors: string[] }
// Catalog = { concepts: readonly string[]; misconceptions: readonly string[] }, from content/catalog.ts
```

**State machine**

```
            submit(wrong)                      submit(correct, not last)
 question ───────────────▶ question            question ─────────────────▶ explanation
 (attempt+1, eliminate,    (state unchanged)   (stepIndex+1, state=resultState)
  feedback=incorrect)                               │ continue
                                                    ▼
                                                 question (feedback cleared, attempt=0)

 question ──submit(correct, last)──▶ explanation (stepIndex = n, exerciseCompleted=true)
                                        │ continue
                                        ▼
                                     complete   (all further submit/continue → rejected / no-op)
```

Rules:
- `startRun` → `stepIndex 0`, `phase 'question'`, `state = initialState`,
  `attempt 0`, no feedback. The `initialState` object is deep-cloned, never
  shared.
- A correct answer advances **exactly one** step. `outcome.attempt` is the
  1-based attempt number for that checkpoint.
- An incorrect answer never changes `stepIndex` or `state`. It never reveals
  the correct choice. Eliminated choices are disabled in the UI, so a student
  is guaranteed to finish within `choices.length` attempts, and no "reveal
  answer" button is needed.
- `exerciseCompleted: true` is returned **exactly once per run**, on the final
  correct submission. Analytics fires `exercise_completed` from that outcome
  only.
- `previousState` is set on correct transitions so the viz can highlight
  changes. Highlighted code lines during `explanation` are the *just-executed*
  checkpoint's lines (`checkpoints[stepIndex-1]`).
- A checkpoint may have `resultState` deep-equal to the prior state
  (ll04-c2). This is allowed.
- The engine is deterministic, so identical inputs produce identical outputs.
  It never calls `Date`, `Math.random`, `fetch`, or `localStorage`.

### 4.4 Validation (`validateExercise`)

Content is validated in a unit test at build time, for every exercise in
`content/`, and again at runtime when a screen loads an exercise. A malformed
exercise shows a friendly "This exercise is unavailable" message instead of
crashing. Rules:

1. `id`, `moduleId`, `title`, and `objective` are non-empty. `code.length ≥ 1`.
   The exercise `id` matches `/^[A-Z]{2,3}-\d{2}$/` (`LL-01`). `terminology`
   and `visualization` are among their allowed values.
2. `checkpoints.length ≥ 1`. Checkpoint ids are unique and match
   `/^[a-z]{2,3}\d{2}-c\d+$/`. They are also prefixed by the exercise id,
   lower-cased without the hyphen (`LL-01` → `ll01-`).
3. Each checkpoint has 2–4 choices with unique ids. The ids are `a`, `b`, `c`,
   `d` in display order (EXERCISES §0.1). `correctChoiceId` is one of them.
   Every choice has non-empty text.
4. The correct choice has **no** misconception. Every incorrect choice has a
   misconception with a non-empty `id` and `hint`.
5. Every number in `lines` is within `1..code.length`, and `lines` is
   non-empty.
6. `explanation` and `question` are non-empty.
7. Every `ProgramState` (initial and each result) is well-formed: object ids
   are unique; every `ref` target exists in `heap`; variable names are unique
   within a frame; `frames.length ≥ 1`; `Node` objects have exactly 2 fields
   (an int field, then `next` ref); `BigNum` objects have `myHead` ref (or
   `unspecified`) and `mySize` int.
8. **Terminology sets are not mixed** (decision A1). In a `generic-node`
   exercise, every Node's first field is `data` and no `BigNum` objects
   exist. In a `bignum-node` exercise, every Node's first field is `digit`.
   A mismatch is rejected.
9. Misconception ids and concept ids exist in the catalogs
   (`content/catalog.ts`, transcribed from EXERCISES §0.4–0.5). The catalog is
   **passed in by the caller** (`validateExercise(input, catalog)`), because
   `engine/` must not import `content/` (§3).

The validator accepts arbitrary input, never throws, and returns **every**
error it finds, each prefixed with its location (for example
`ll01-c3 resultState: …`).

### 4.5 Implementation notes (M1)

- **Immutability.** Engine functions never mutate the exercise or the run
  they're given. They return new objects. Program states are copied with
  `structuredClone` when they enter a run (from `initialState` or a
  `resultState`), so content objects are never shared with run state. After
  that, states are treated as immutable values, so `previousState` may share
  a reference with the earlier run's `state`.
- **Rejection precedence** in `submitAnswer`: `not-in-question-phase`, then
  `unknown-choice`, then `already-eliminated`. A rejected submission returns
  the run unchanged.
- **`attempt` and `eliminated` during `explanation`.** They keep their values
  so the UI can still show which choices were tried. `continueRun` resets
  them to `0` and `[]`.
- **`StepResult.hintsShown`** is derived from the eliminated choices'
  misconception ids, in the order they were tried.
- **`continueRun`** in the `question` or `complete` phase returns the run
  unchanged.

---

## 5. Frontend application

### 5.1 Screens and routing

Hash routes avoid any server rewrite config on Vercel and any router
dependency:

| Route | Screen |
|---|---|
| `#/` | Landing: one-line pitch and module cards. Recursion shows "Coming soon" until M6. |
| `#/m/linked-lists` | Module: ordered exercise list with objectives and a local "Completed" badge |
| `#/x/LL-01` | Exercise |
| `#/x/LL-01/done` | Completion summary (only reachable from a completed run; otherwise redirects to the exercise) |

### 5.2 Exercise screen layout

```
Desktop (≥ 1024px)                               Mobile (< 1024px)
┌─────────────────────┬─────────────────────┐   ┌───────────────────┐
│ CodePanel           │ Visualization       │   │ CodePanel         │
│  (highlighted line, │  (React Flow,       │   ├───────────────────┤
│   focus label,      │   fit to view)      │   │ Visualization     │
│   Node class ▸)     │ OutputPanel (if any)│   │ OutputPanel       │
├─────────────────────┴─────────────────────┤   ├───────────────────┤
│ QuestionPanel (radio group + Check)       │   │ QuestionPanel     │
│ FeedbackPanel (hint / explanation +       │   │ FeedbackPanel     │
│                Continue)                  │   │                   │
└───────────────────────────────────────────┘   └───────────────────┘
```

- `ExerciseScreen` owns one piece of React state: `ExerciseRun`. It
  uses `useState`/`useReducer`, with no global store. It calls engine
  functions, passes `run.state`/`run.previousState` to viz, and sends outcomes
  to analytics.
- `QuestionPanel` is a semantic radio group plus a **Check answer** button.
  Selecting a choice doesn't submit it, which prevents accidental taps on
  mobile.
- `FeedbackPanel` is an `aria-live="polite"` region. Incorrect feedback reads
  "✗ Not quite" plus the hint. Correct feedback reads "✓ Correct" plus the
  explanation and a **Continue** button, which receives focus.
- `CodePanel` renders `code[]` as an ordered list of lines in monospace, with
  a small hand-written Java keyword tokenizer (no library). The current lines
  are marked with `aria-current="step"`, plus a background and a left-bar
  marker (not color alone).

### 5.3 Visualization boundary

Visualization components **render supplied state**. They receive
`ProgramState` (and optionally `previousState`). They don't know about
checkpoints, choices, correctness, or exercises.

### 5.4 Implementation notes (M3)

- **Content format.** `content/ll01.ts` and `ll02.ts` are verbatim
  transcriptions of EXERCISES.md, built with the small data builders in
  `content/build.ts`. Text keeps the doc's inline markdown (`` `code` `` and
  `*emphasis*`), which `components/RichText.tsx` renders. Tests compare every
  string to the doc, and every state to the M2 notation parser.
- **Registry and modules.** `content/index.ts` holds exercises that have
  content. `content/modules.ts` lists LL-01..LL-04, all playable since M4. An
  exercise listed without content would show "Coming next". Recursion is not
  listed.
- **BigNum reference panel (M4).** For `bignum-node` exercises, the "Node
  class" disclosure also lists the BigNum fields `private Node myHead;` and
  `private int mySize;` (EXERCISES §0.6).
- **No correctness logic in the UI.** Screens show the engine's run
  (`feedback`, `eliminated`, `results`). They never read `correctChoiceId`
  or misconceptions from content, and test U1 enforces this. The chosen
  answer shown as "✓ Correct" during review comes from
  `run.feedback.choiceId`.
- **Review phase.** During `explanation`, the screen keeps showing the
  answered checkpoint: its step number, its question (locked), and its lines
  marked "ran". The diagram shows `run.state` with `previousState`
  highlighting. Continue moves on.
- **Focus.** A wrong answer moves focus to the hint. A correct answer moves
  it to Continue *without scrolling*. If the memory panel is then not fully in
  view (phones, and long code such as LL-04 on desktop), the page scrolls it
  into view, so the student sees the change first. Continue moves focus to
  the next question's legend, and a route change moves it to the page `h1`.
  (M4 extended the M3 phone-only behavior to every width.)
- **Completion.** The completion route (`#/x/<id>/done`) reads results kept in
  App memory. Without them it redirects to the exercise. Re-entering an
  exercise always starts a fresh run at step 1, because in-progress runs are
  not persisted. Completion is stored in `localStorage['traceds.completed']`
  (A9), with every access guarded.
- **"Practice another exercise"** goes to the next available exercise in
  module order (wrapping around) that isn't completed yet, otherwise the next
  available one, otherwise the module page.
- **Layout.** `lg` (≥ 1024 px) uses two equal columns (code | memory), with
  the question below. The course's one-line `for` header must fit unwrapped
  in the code column. Below that width, panels stack. The page itself never
  scrolls horizontally (E2E test). Wide code lines scroll inside the code
  panel, and wide diagrams scroll inside the diagram box (M2 behavior).
- **Empty memory** shows the text "Nothing in memory yet." and does not mount
  React Flow. A hidden container measures 0 px, which broke the first real
  render on phones.

---

## 6. Linked-list visualization

### 6.1 Pipeline

```
ProgramState ──layout.ts──▶ { nodes: FlowNode[], edges: FlowEdge[] } ──▶ <ReactFlow/>
             ──diff.ts────▶ ChangeSet (changed objects/fields/variables) ─┘
             ──describe.ts▶ plain-text description (sr-only, aria-live)
```

`layout.ts`, `diff.ts`, and `describe.ts` are pure functions with unit tests.
React components are thin.

### 6.2 Layout rules (deterministic, no layout library)

1. **Roots.** Walk frames from bottom to top, and variables in declaration
   order. Each variable whose target is an object not yet placed starts a new
   **row**.
2. **Rows.** From a row's root object, follow refs (`myHead`, then `next`).
   Each newly visited object gets the next column in that row. If an object
   was already placed, draw an edge to it instead (cross-row edges are
   allowed). A visited-set guarantees termination on cycles.
3. **Variables** render as labelled pills above the object they refer to.
   Several variables on one object stack vertically without overlap. A
   variable holding `null` points to its own small `null` marker. An `int`
   variable renders as `name = 3` in a variables strip. An `unspecified`
   reference (variable or field) renders as a dashed `?` marker with no edge.
   Its caption is supplied by the renderer as "not shown", never authored as
   logic.
4. **`next → null`** renders as a `null` terminator box after the node (course
   style: `[data | next] → null`).
5. **Unreachable objects** (not reachable from any frame variable) go on a
   final row with reduced opacity and the text label "unreachable". They are
   derived, never authored.
6. **Node rendering:** two cells, `[ 4 | • ]`, where the next cell is the
   source handle of the edge. The first cell's label is the field name from
   state (`data` or `digit`), shown as a small caption.
7. **BigNum rendering:** a box with the caption `BigNum` and two cells,
   `myHead` (ref) and `mySize` (int).
8. **Interaction:** the diagram is read-only. `nodesDraggable=false`,
   `panOnDrag=false`, `zoomOnScroll=false`, `preventScrolling=false`, and
   `fitView` runs on every state change. This prevents scroll traps on
   mobile.
9. **Change highlighting:** objects, fields, and variables in the
   `ChangeSet` get an outline and a small "changed" badge for the explanation
   phase. CSS transitions of ≤ 300 ms are disabled under
   `prefers-reduced-motion`.

### 6.3 Text alternative

`describe(state)` produces, for example: *"head refers to node 4. cur refers
to node 7. List from head: 4 → 7 → 1 → null. Output: none."* An
`unspecified` reference reads as "<name>: not shown in this exercise". It is
rendered
visually hidden next to the diagram and announced on change. Playwright and
RTL tests also use it as a stable assertion surface.

---

### 6.4 Implementation notes (M2)

- **Modules.** `viz/layout.ts` maps `ProgramState` to a renderer-independent
  `VizLayout` (`viz/types.ts`): positioned boxes and edges. It has no React Flow
  types. `viz/linkedlist/toFlow.ts` maps that onto React Flow nodes and edges,
  and `viz/linkedlist/boxes.tsx` draws each box. `reachability.ts`, `diff.ts`,
  and `describe.ts` are pure.
- **Several variables on one object** sit **side by side** above it, each with
  its own arrow, rather than stacked vertically. Stacked pills would draw
  their arrows through each other. A slot widens to fit its pills, so nothing
  overlaps.
- **Variables holding `null`** get their own `null` markers on a row after the
  object rows (rule 3). **Unreachable** objects come last.
- **`next → null`** is a dot in the `next` cell with an arrow to a `null` box,
  following the course drawing `[data | next] → null`.
- **BigNum cells are drawn `[mySize | myHead]`**, so the `myHead` arrow leaves
  from the box's right edge toward the list. Field order in state is
  unchanged.
- **`unspecified`** fields render as a dashed `?` *inside* their cell (with the
  tooltip "not shown in this exercise"). There is no edge and no null marker.
  `int` and `unspecified` variables are listed as text above the diagram.
- **Text description wording:** `<var> refers to node k.` / `<var> is null.` /
  `Node k has data 4, and its next refers to node j.` / `BigNum k has mySize
  3, and its myHead refers to node j.` / `List from head: 4 → 7 → null.` /
  `List from copy.myHead: …` / `Node k is unreachable.` / `Output: none.`
  Objects are numbered in diagram order. Internal ids never appear.
- **Narrow screens.** The diagram fits its panel at zoom ≤ 1 but never below
  `MIN_SCALE` (0.8). Below that, the diagram box (not the page) scrolls
  horizontally. Pan, zoom, and drag gestures are all disabled, so vertical
  page scrolling is never captured.
- **Accessibility.** The React Flow canvas is `aria-hidden`, with no focusable
  nodes or edges and React Flow's attribution link hidden, so there is no
  keyboard stop inside hidden content. The `<figcaption>` is the accessible
  equivalent (`sr-only`, `aria-live="polite"`). "unreachable" and "changed"
  are shown as text badges, not only as styling.
- **Re-fitting (M4).** The React Flow instance is keyed by the layout
  signature and a debounced window-resize counter, so it remounts and
  `fitView` runs on freshly measured nodes. Re-fitting a mounted instance had
  run before newly added nodes were measured, and clipped them. This was
  found in M4 and is covered by `e2e/diagram-fit.spec.ts`.
- **Swipe note (M4).** When the diagram is wider than its box (phones at
  `MIN_SCALE`), a visible note reads "Swipe sideways to see the whole
  diagram →". It is `aria-hidden`, because the text description is already
  complete.
- **Dev harness.** `?viz-harness` in the dev server (optionally `&only=ll04`)
  renders every EXERCISES.md state. The states are parsed by
  `src/dev/notation.ts` from the doc's §0.2 notation. It is gated on
  `import.meta.env.DEV`, so it is absent from production builds (verified).
  The dev server's `fs.allow` includes the repo root so the harness can read
  `docs/`.

## 7. Recursion visualization (M5, design only)

Same contract: it receives `ProgramState` with `frames.length ≥ 1` and renders
a vertical call stack (top frame emphasized, each frame listing its
variables). **Decision (Q6): the recursion call stack uses plain React
components and Tailwind, not React Flow.** A stack is a list, so it needs no
graph rendering. Frame return annotations will be added as an optional
`Frame.returnValue?: Value` field in M5. This is an additive change.

---

## 8. Analytics client (frontend `analytics/`)

- `session.ts`: reads `localStorage['traceds.sessionId']`, or generates one
  with `crypto.randomUUID()` and stores it. If storage throws (private mode),
  it uses an in-memory UUID for the page lifetime. All access is in try/catch.
- `client.ts`: holds an in-memory queue. It flushes when the queue has 10
  events, every 5 s, or on `visibilitychange → hidden`, using
  `fetch(url, { method: 'POST', keepalive: true })`. `sendBeacon` is avoided
  because a JSON `Blob` is not CORS-safelisted. On failure it retries up to 2
  times with backoff, then drops the batch. **Every public function catches
  all errors and returns `void`.** Nothing awaits analytics on the learning
  path.
- If `VITE_API_BASE_URL` is unset (local dev without a backend), the client
  becomes a no-op.
- The event vocabulary and payloads are defined in
  [ANALYTICS.md](ANALYTICS.md).

---

## 9. Backend (Go)

### 9.1 Structure

- `cmd/server/main.go` reads env vars, opens the pgx pool, builds the router,
  and serves on `$PORT` with graceful shutdown.
- `internal/api` contains handlers, JSON decoding with
  `DisallowUnknownFields` and `http.MaxBytesReader` (64 KiB), field
  validation, and CORS middleware with an origin allowlist from
  `ALLOWED_ORIGINS`.
- `internal/store` defines a `Store` interface with `CreateSession`,
  `InsertEvents`, `InsertFeedback`, and `Ping`. `postgres.go` is the pgx
  implementation. `memory.go` is an in-memory fake for handler tests. This is
  the only interface abstraction in the backend. It exists so handler tests
  run without a database.

### 9.2 API

All bodies are JSON. All errors use the shape `{"error": "<message>"}`.
Unknown fields are rejected with 400, which makes it hard to send PII
accidentally.

**`GET /api/v1/health`** → `200 {"status":"ok","database":"ok"|"unavailable"}`.
It always returns 200 while the process is up. The database status is
informational, for smoke tests.

**`POST /api/v1/sessions`**
```json
{ "session_id": "uuid", "app_version": "2026.10.12-abc123", "viewport": "narrow" }
```
This is an idempotent upsert (`ON CONFLICT DO NOTHING`). It returns `201`
when created and `200` when the session already exists, with body
`{"session_id": "..."}`. `viewport` is `narrow` or `wide`, which is enough to
answer "does mobile work?" without fingerprinting.

**`POST /api/v1/events`**
```json
{ "session_id": "uuid",
  "events": [ { "event_id": "uuid", "event_type": "answer_submitted", "run_id": "uuid",
                "module_id": "linked-lists", "exercise_id": "LL-01", "step_id": "ll01-c3",
                "choice_id": "a", "correct": false, "attempt_number": 1,
                "concept_id": "aliasing", "misconception_id": "assignment-copies-object",
                "client_ts": "2026-10-12T21:30:00.000Z" } ] }
```
- 1–50 events per request. Each event is validated per ANALYTICS §3.
- The session row is upserted first, so events are never lost when the
  earlier `/sessions` call failed.
- Inserts use `ON CONFLICT (id) DO NOTHING` on `event_id`, so client retries
  are idempotent.
- The response is `202 {"accepted": n}`. If any event fails validation, the
  whole batch gets 400, and the client drops it rather than retrying.

**`POST /api/v1/feedback`**
```json
{ "session_id": "uuid", "helpfulness": 4, "requested_topic": "doubly-linked-lists",
  "comments": "optional free text, ≤ 2000 chars" }
```
The response is `201`. `requested_topic` must be one of the values in
ANALYTICS §5.

No other endpoints exist. Adding one requires justification in docs and human
approval.

### 9.3 Database schema (`migrations/0001_init.sql`)

```sql
create table sessions (
  id           uuid primary key,
  created_at   timestamptz not null default now(),
  app_version  text,
  viewport     text check (viewport in ('narrow','wide'))
);

create table events (
  id               uuid primary key,                       -- client event_id (idempotency)
  session_id       uuid not null references sessions(id),
  run_id           uuid,                                   -- one exercise attempt-through
  event_type       text not null check (event_type in (
                     'session_started','module_selected','exercise_started',
                     'answer_submitted','hint_shown','exercise_completed',
                     'survey_submitted')),
  module_id        text,
  exercise_id      text,
  step_id          text,
  choice_id        text,
  correct          boolean,
  attempt_number   integer check (attempt_number between 1 and 10),
  concept_id       text,
  misconception_id text,
  client_ts        timestamptz,
  created_at       timestamptz not null default now()
);
create index events_type_exercise_idx on events (event_type, exercise_id);
create index events_session_idx       on events (session_id);
create index events_step_idx          on events (step_id) where event_type = 'answer_submitted';

create table feedback (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(id),
  helpfulness      smallint not null check (helpfulness between 1 and 5),
  requested_topic  text,
  comments         text check (char_length(comments) <= 2000),
  created_at       timestamptz not null default now()
);

-- Supabase exposes the public schema through its auto-generated REST API.
-- Enable RLS with NO policies so the anon/authenticated keys can neither read nor write.
-- The Go backend connects as the database owner role, which bypasses RLS.
alter table sessions enable row level security;
alter table events   enable row level security;
alter table feedback enable row level security;
```

Migrations are plain SQL files, applied with `psql "$DATABASE_URL" -f …`
(documented in the README), and tested in CI against a Postgres service
container. There is no migration framework.

### 9.4 Configuration

| Env var | Where | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | Vercel | Backend origin. Unset means analytics is a no-op. |
| `VITE_APP_VERSION` | Vercel (build) | Sent with sessions |
| `DATABASE_URL` | Cloud Run (Secret Manager) | Supabase connection string (pooler) |
| `ALLOWED_ORIGINS` | Cloud Run | Comma-separated CORS allowlist: the Vercel-provided production URL (`https://<project>.vercel.app`; no custom domain in V1, decision Q2) and `http://localhost:5173` |
| `PORT` | Cloud Run (injected) | Listen port |

With the Supabase transaction pooler (PgBouncer, port 6543), pgx must use
`default_query_exec_mode=simple_protocol` (or the session pooler, port 5432)
because prepared statements are not supported in transaction mode.

---

## 10. Privacy and security

- **No PII is collected.** There are no names, emails, student IDs, IP
  addresses, or full user agents in the database. The session id is a random
  UUID generated in the browser.
- The feedback `comments` field is free text. The UI says *"Please don't
  include your name, email, or student ID."* This is the one place PII could
  appear. It is accepted as a risk and documented here.
- **IP addresses (decision Q8):** TraceDS code never reads, stores, logs,
  or derives identifiers from client IP addresses. The backend doesn't log
  `RemoteAddr` or `X-Forwarded-For`. Default provider infrastructure and
  security logging (Cloud Run request logs, Vercel, Supabase) is accepted
  as is. Those logs are never copied into the TraceDS schema or used to
  identify students.
- RLS is enabled with no policies, so Supabase's public API can't be used to
  read analytics.
- There is abuse protection without new infrastructure: body size limits,
  batch limits, strict validation, and Cloud Run max-instances. Spam inserts
  are an accepted V1 risk. If they occur, an in-process rate limiter is the
  fallback (not Redis).
- Secrets live only in Vercel/Cloud Run env config and GitHub Actions
  secrets. They are never committed.

---

## 11. Deployment

- **Frontend:** Vercel project with root directory `frontend/`, build command
  `npm run build`, output `dist/`. Preview deploys come from PRs.
- **Backend:** multi-stage Dockerfile (Go build → distroless static). Deployed
  with `gcloud run deploy traceds-api --source backend/ --region …`, run
  manually (approved for launch, Q7). Automating this with GitHub
  OIDC/Workload Identity is post-launch.
- **Accounts (Q3):** the human owner provisions the Vercel, Google Cloud, and
  Supabase projects during M10. No earlier milestone depends on them.
- **Repository (Q4):** GitHub repository `TraceDS`.
- **Database:** Supabase project. Apply `migrations/*.sql` once, with psql.
- **CI (`.github/workflows/ci.yml`)**, on every push and PR:
  frontend `typecheck`, `lint`, `vitest run`, `build`, and Playwright (against
  `vite preview`, backend mocked through route interception); backend
  `go vet` and `go test ./...` with a `postgres:16` service container for
  store integration tests.

---

## 12. Architectural decisions (ADRs)

### ADR-1: REST/JSON instead of GraphQL
**Decision:** Four REST endpoints with plain JSON.
**Why:** The API is write-only telemetry with four fixed shapes. GraphQL's
strengths (client-chosen projections, graph traversal, many consumers) don't
apply. It would add a schema layer, a server library, and a client library,
and complicate caching and debugging, on a ship-today timeline. REST is
trivially testable with `httptest` and curl and works with `fetch` and no
client library.

### ADR-2: The exercise engine runs client-side
**Decision:** Correctness, hints, and state transitions are computed in the
browser by a pure TypeScript engine over bundled content.
**Why:** (1) **Resilience.** Practice continues if Cloud Run, Supabase, or the
network fails, which is the most important property for students studying
the night before an exam. (2) **Latency.** Feedback is instant, with no round
trip on every answer, even on bad mobile connections. (3) **Simplicity.** One
deterministic, pure module is easy to test exhaustively.
**Trade-off accepted:** Answers ship in the JS bundle, so a determined student
could read them. This is a practice tool, not an assessment, so cheating only
harms the cheater.

### ADR-3: Go for the backend
**Decision:** Go with the standard library `net/http` and pgx.
**Why:** This is required by the technology contract, and it fits: a single
static binary, fast cold starts on Cloud Run (which matters with
scale-to-zero), method-aware routing in the standard library since 1.22,
`httptest` for handler tests, and only one third-party dependency.

### ADR-4: PostgreSQL (Supabase)
**Decision:** Three relational tables in managed Postgres.
**Why:** Every analytics question in ANALYTICS.md is a straightforward SQL
aggregate over `events`. Managed Postgres needs no ops work, gives a SQL
editor for ad-hoc analysis on launch day, and provides check constraints that
enforce the event vocabulary at the storage layer. Explicit columns are used
instead of a JSON blob, so queries stay simple and the schema itself
documents what is collected (supporting the no-PII rule). Supabase is used
**only as Postgres**: no Supabase Auth, no supabase-js, and no direct client
access.

### ADR-5: React Flow for linked-list diagrams
**Decision:** Render heap and reference diagrams with React Flow and custom
node types, positioned by our own deterministic layout function.
**Why:** Linked-list memory is a graph: objects are nodes, and references are
directed edges, some crossing rows (aliasing, cross-links during insertion and
deep copy). React Flow provides edge routing, arrowheads, handles on specific
node cells (the `next` cell), fit-to-view, and SVG/DOM rendering that stays
accessible and testable. Hand-rolling edge routing is a time sink. We do
**not** use its interactivity (dragging, panning) or a layout library. The
layout is ~100 lines of tested pure code, because pedagogy needs a stable,
predictable picture (head on the left, list order left-to-right, the copy
on its own row).

### ADR-6: Anonymous analytics
**Decision:** A random UUID in `localStorage`. No accounts, no PII, and only
the explicit columns in §9.3.
**Why:** The product must work with zero signup for students who get a link
by email. Collecting identities adds consent and privacy obligations
(FERPA-adjacent concerns for student data) without helping answer the launch
questions, which are all aggregate. `DisallowUnknownFields` and fixed columns
make accidental PII collection structurally difficult.
**Limitation:** a "session" is really a browser profile. One student on two
devices counts twice, and clearing storage resets the id. That is acceptable
for aggregate launch metrics.

### ADR-7: Graceful analytics failure
**Decision:** Analytics is fire-and-forget. The learning path never awaits it,
and every analytics function swallows its own errors.
**Why:** A broken telemetry pipeline must never cost a student a study
session. This is enforced by tests: an engine/UI integration test with a
throwing analytics client, and a Playwright test with all `/api/**` requests
aborted that still completes an exercise (TESTING.md). Some data may be lost
during outages. We accept that over any user-visible failure.

### ADR-8: Exercise content as typed TypeScript data
**Decision:** Exercises live in `.ts` files typed as `Exercise`, plus runtime
`validateExercise`.
**Why:** This is data-driven content (no logic in exercises) with compile-time
checking of shapes and ids, and no loader or fetch. Adding an exercise means
adding a data file and a test, not code.

### ADR-9: Full-state snapshots per checkpoint
See §4.2. Snapshots favour authoring clarity and testability over a smaller
data size. Each exercise is a few kilobytes.

### ADR-10: Hash routing, no router library
**Decision:** A tiny hash router.
**Why:** There are four routes and no server, so Vercel needs no rewrite
config. Deep links like `…/#/x/LL-04` can be emailed directly. A router
library isn't justified.

### ADR-11: No global state library
**Decision:** `useReducer` in `ExerciseScreen`. The engine *is* the reducer
logic.
**Why:** Only one piece of complex state exists (`ExerciseRun`), and it is
local to one screen. Redux would add ceremony and no capability.
