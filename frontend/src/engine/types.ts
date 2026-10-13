// Domain model for TraceDS exercises (docs/ARCHITECTURE.md §4).
// Pure types only: no runtime code, no imports.

// ---------------------------------------------------------------------------
// §4.1 Program state
// ---------------------------------------------------------------------------

/** Internal identity of a heap object ("A", "B", "X"). Never shown to students. */
export type ObjectId = string

export type Value =
  | { kind: 'int'; value: number }
  /** `target: null` is Java `null`. */
  | { kind: 'ref'; target: ObjectId | null }
  /** A value the exercise deliberately does not claim (EXERCISES §0.2). Never `null`. */
  | { kind: 'unspecified' }

/** A field of a heap object, in rendering order. */
export interface Field {
  name: string
  value: Value
}

export interface Variable {
  name: string
  value: Value
}

export type HeapObjectType = 'Node' | 'BigNum'

export interface HeapObject {
  id: ObjectId
  type: HeapObjectType
  /** Node: [data|digit, next]. BigNum: [myHead, mySize]. */
  fields: Field[]
}

export interface Frame {
  /** "main", "clone()", later "fact(3)". */
  method: string
  /** Declared, in-scope variables only. */
  variables: Variable[]
}

export interface ProgramState {
  /** Bottom → top. Linked-list exercises use exactly one frame. */
  frames: Frame[]
  heap: HeapObject[]
  /** Printed lines, in order. */
  output: string[]
}

// ---------------------------------------------------------------------------
// §4.2 Exercise content
// ---------------------------------------------------------------------------

export interface Misconception {
  id: string
  hint: string
}

export interface Choice {
  /** "a" | "b" | "c" | "d", in display order. */
  id: string
  text: string
  /** Required if and only if the choice is incorrect. */
  misconception?: Misconception
}

export interface Checkpoint {
  /** e.g. "ll01-c3". Permanent once published. */
  id: string
  /** 1-based code lines highlighted for this checkpoint. */
  lines: number[]
  /** Sub-expression being evaluated, e.g. "cur != null". */
  focus?: string
  /** Concept id (EXERCISES §0.4). */
  concept: string
  question: string
  /** 2–4 choices, in display order. */
  choices: Choice[]
  correctChoiceId: string
  /** Full snapshot of the program state after this checkpoint. */
  resultState: ProgramState
  explanation: string
}

/** Terminology set (EXERCISES §0.6). Also selects the Node class panel. */
export type Terminology = 'generic-node' | 'bignum-node'

export type VisualizationKind = 'linked-list' | 'recursion'

export interface Exercise {
  /** e.g. "LL-01". */
  id: string
  /** e.g. "linked-lists". */
  moduleId: string
  title: string
  objective: string
  /** One entry per displayed line. */
  code: string[]
  terminology: Terminology
  visualization: VisualizationKind
  initialState: ProgramState
  checkpoints: Checkpoint[]
}

/** Known concept and misconception ids (EXERCISES §0.4–0.5), supplied by content. */
export interface Catalog {
  concepts: readonly string[]
  misconceptions: readonly string[]
}

export type ValidationResult =
  | { ok: true; exercise: Exercise }
  | { ok: false; errors: string[] }

// ---------------------------------------------------------------------------
// §4.3 Engine run state
// ---------------------------------------------------------------------------

export type Phase = 'question' | 'explanation' | 'complete'

export interface StepResult {
  checkpointId: string
  /** Total submissions on this checkpoint, including the correct one. */
  attempts: number
  /** Misconception ids of the hints shown, in order. */
  hintsShown: string[]
}

export type Feedback =
  | { kind: 'incorrect'; choiceId: string; misconceptionId: string; hint: string }
  | { kind: 'correct'; choiceId: string; explanation: string }

export interface ExerciseRun {
  exerciseId: string
  /** Checkpoint being asked; equals checkpoints.length once solved. */
  stepIndex: number
  phase: Phase
  /** Current program state. */
  state: ProgramState
  /** State before the last correct transition (for change highlighting). */
  previousState: ProgramState | null
  /** Submissions made on the current checkpoint. */
  attempt: number
  /** Wrong choice ids already tried on the current checkpoint. */
  eliminated: string[]
  feedback: Feedback | null
  results: StepResult[]
}

export type RejectionReason = 'not-in-question-phase' | 'unknown-choice' | 'already-eliminated'

export type Outcome =
  | {
      type: 'incorrect'
      checkpointId: string
      choiceId: string
      attempt: number
      misconceptionId: string
      concept: string
    }
  | {
      type: 'correct'
      checkpointId: string
      choiceId: string
      attempt: number
      concept: string
      exerciseCompleted: boolean
    }
  | { type: 'rejected'; reason: RejectionReason }

export interface SubmitResult {
  run: ExerciseRun
  outcome: Outcome
}
