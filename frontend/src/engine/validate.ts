// Exercise validation (docs/ARCHITECTURE.md §4.4).
//
// Accepts arbitrary input, never throws, and reports every problem it finds.
// The concept/misconception catalog is passed in by the caller so that the
// engine stays independent of content (ARCHITECTURE §3).

import type { Catalog, Exercise, ValidationResult } from './types'

const EXERCISE_ID = /^[A-Z]{2,3}-\d{2}$/
const CHECKPOINT_ID = /^[a-z]{2,3}\d{2}-c\d+$/
const TERMINOLOGIES = ['generic-node', 'bignum-node']
const VISUALIZATIONS = ['linked-list', 'recursion']
const NODE_INT_FIELD: Record<string, string> = { 'generic-node': 'data', 'bignum-node': 'digit' }

type Obj = Record<string, unknown>

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValue(value: unknown): boolean {
  if (!isObject(value)) return false
  switch (value.kind) {
    case 'int':
      return Number.isInteger(value.value)
    case 'ref':
      return value.target === null || isNonEmptyString(value.target)
    case 'unspecified':
      return true
    default:
      return false
  }
}

function isRef(value: unknown): boolean {
  return isObject(value) && value.kind === 'ref'
}

function isInt(value: unknown): boolean {
  return isObject(value) && value.kind === 'int'
}

/** The object id a value refers to, or null for non-references and Java null. */
function refTarget(value: unknown): string | null {
  return isObject(value) && value.kind === 'ref' && typeof value.target === 'string' ? value.target : null
}

/** Validates one ProgramState. `where` prefixes every message ("initialState", "ll01-c3 resultState"). */
function validateState(state: unknown, where: string, terminology: unknown, errors: string[]): void {
  if (!isObject(state)) {
    errors.push(`${where} must be an object`)
    return
  }

  // Heap objects: ids, types, field shapes, terminology.
  const objectIds = new Set<string>()
  const refs: { from: string; target: string }[] = []
  if (!Array.isArray(state.heap)) {
    errors.push(`${where}: heap must be an array`)
  } else {
    const expectedIntField = typeof terminology === 'string' ? NODE_INT_FIELD[terminology] : undefined
    let reportedBigNum = false
    state.heap.forEach((object, i) => {
      if (!isObject(object) || !isNonEmptyString(object.id) || !Array.isArray(object.fields)) {
        errors.push(`${where}: heap object ${i} must have an id and a fields array`)
        return
      }
      const id = object.id
      if (objectIds.has(id)) errors.push(`${where}: duplicate object id "${id}"`)
      objectIds.add(id)

      const fields = object.fields as unknown[]
      for (const field of fields) {
        if (!isObject(field) || !isNonEmptyString(field.name) || !isValue(field.value)) {
          errors.push(`${where}: object "${id}" has a malformed field`)
          return
        }
      }
      const named = fields as { name: string; value: unknown }[]
      for (const field of named) {
        const target = refTarget(field.value)
        if (target !== null) refs.push({ from: `${object.type} "${id}" field "${field.name}"`, target })
      }

      if (object.type === 'Node') {
        if (named.length !== 2) {
          errors.push(`${where}: Node "${id}" must have exactly two fields`)
          return
        }
        const [first, second] = named
        if (!isInt(first.value)) errors.push(`${where}: Node "${id}" first field must be an int`)
        if (second.name !== 'next' || !isRef(second.value)) {
          errors.push(`${where}: Node "${id}" second field must be a "next" reference`)
        }
        if (expectedIntField && first.name !== expectedIntField) {
          errors.push(
            `${where}: ${terminology} exercise: Node "${id}" must use field "${expectedIntField}", not "${first.name}"`,
          )
        }
      } else if (object.type === 'BigNum') {
        const [myHead, mySize] = named
        const ok =
          named.length === 2 &&
          myHead.name === 'myHead' &&
          (isRef(myHead.value) || (isObject(myHead.value) && myHead.value.kind === 'unspecified')) &&
          mySize.name === 'mySize' &&
          isInt(mySize.value)
        if (!ok) errors.push(`${where}: BigNum "${id}" must have fields myHead (reference) and mySize (int)`)
        if (terminology === 'generic-node' && !reportedBigNum) {
          errors.push(`${where}: generic-node exercise must not contain BigNum objects`)
          reportedBigNum = true
        }
      } else {
        errors.push(`${where}: object "${id}" has unknown type "${String(object.type)}"`)
      }
    })
  }

  // Frames and variables.
  if (!Array.isArray(state.frames)) {
    errors.push(`${where}: frames must be an array`)
  } else if (state.frames.length === 0) {
    errors.push(`${where}: frames must contain at least one frame`)
  } else {
    state.frames.forEach((frame, i) => {
      if (!isObject(frame) || !isNonEmptyString(frame.method) || !Array.isArray(frame.variables)) {
        errors.push(`${where}: frame ${i} must have a method name and a variables array`)
        return
      }
      const names = new Set<string>()
      for (const variable of frame.variables as unknown[]) {
        if (!isObject(variable) || !isNonEmptyString(variable.name)) {
          errors.push(`${where}: frame "${frame.method}" has a variable without a name`)
          continue
        }
        if (names.has(variable.name)) errors.push(`${where}: duplicate variable "${variable.name}" in frame "${frame.method}"`)
        names.add(variable.name)
        if (!isValue(variable.value)) {
          errors.push(`${where}: variable "${variable.name}" has an invalid value`)
          continue
        }
        const target = refTarget(variable.value)
        if (target !== null) refs.push({ from: `variable "${variable.name}"`, target })
      }
    })
  }

  // Dangling references (only meaningful when the heap itself was readable).
  if (Array.isArray(state.heap)) {
    for (const { from, target } of refs) {
      if (!objectIds.has(target)) errors.push(`${where}: ${from} refers to missing object "${target}"`)
    }
  }

  if (!Array.isArray(state.output) || !state.output.every((line) => typeof line === 'string')) {
    errors.push(`${where}: output must be an array of strings`)
  }
}

function validateCheckpoint(
  checkpoint: unknown,
  index: number,
  exercise: Obj,
  catalog: Catalog,
  seenIds: Set<string>,
  errors: string[],
): void {
  if (!isObject(checkpoint)) {
    errors.push(`checkpoint ${index} must be an object`)
    return
  }

  // Rule 2: ids unique, well-formed, and prefixed by the exercise id.
  const id = isNonEmptyString(checkpoint.id) ? checkpoint.id : `checkpoint ${index}`
  if (!isNonEmptyString(checkpoint.id)) {
    errors.push(`checkpoint ${index}: id must be a non-empty string`)
  } else {
    if (seenIds.has(id)) errors.push(`duplicate checkpoint id "${id}"`)
    seenIds.add(id)
    if (!CHECKPOINT_ID.test(id)) {
      errors.push(`checkpoint id "${id}" must match ${CHECKPOINT_ID} (e.g. "ll01-c1")`)
    } else if (isNonEmptyString(exercise.id) && EXERCISE_ID.test(exercise.id)) {
      const prefix = `${exercise.id.replace('-', '').toLowerCase()}-`
      if (!id.startsWith(prefix)) errors.push(`checkpoint id "${id}" must start with "${prefix}"`)
    }
  }

  // Rule 6: non-empty question and explanation.
  if (!isNonEmptyString(checkpoint.question)) errors.push(`${id}: question must be a non-empty string`)
  if (!isNonEmptyString(checkpoint.explanation)) errors.push(`${id}: explanation must be a non-empty string`)

  // Rule 9: concept id in catalog.
  if (!isNonEmptyString(checkpoint.concept)) {
    errors.push(`${id}: concept must be a non-empty string`)
  } else if (!catalog.concepts.includes(checkpoint.concept)) {
    errors.push(`${id}: unknown concept id "${checkpoint.concept}"`)
  }

  // Rule 5: highlighted lines within the code.
  const codeLength = Array.isArray(exercise.code) ? exercise.code.length : 0
  if (!Array.isArray(checkpoint.lines) || checkpoint.lines.length === 0) {
    errors.push(`${id}: lines must not be empty`)
  } else {
    for (const line of checkpoint.lines) {
      if (!Number.isInteger(line) || (line as number) < 1 || (line as number) > codeLength) {
        errors.push(`${id}: line ${String(line)} is outside 1..${codeLength}`)
      }
    }
  }

  if (checkpoint.focus !== undefined && !isNonEmptyString(checkpoint.focus)) {
    errors.push(`${id}: focus, when present, must be a non-empty string`)
  }

  // Rules 3 and 4: choices.
  if (!Array.isArray(checkpoint.choices)) {
    errors.push(`${id}: choices must be an array`)
  } else {
    const choices = checkpoint.choices as unknown[]
    if (choices.length < 2 || choices.length > 4) errors.push(`${id}: must have 2–4 choices`)

    const choiceIds: string[] = []
    choices.forEach((choice, i) => {
      if (!isObject(choice) || !isNonEmptyString(choice.id)) {
        errors.push(`${id}: choice ${i} must have a non-empty string id`)
        return
      }
      if (choiceIds.includes(choice.id)) errors.push(`${id}: duplicate choice id "${choice.id}"`)
      choiceIds.push(choice.id)
      if (!isNonEmptyString(choice.text)) errors.push(`${id}: choice "${choice.id}" text must be a non-empty string`)

      const isCorrect = choice.id === checkpoint.correctChoiceId
      const misconception = choice.misconception
      if (isCorrect) {
        if (misconception !== undefined) errors.push(`${id}: correct choice "${choice.id}" must not have a misconception`)
      } else if (!isObject(misconception) || !isNonEmptyString(misconception.id) || !isNonEmptyString(misconception.hint)) {
        errors.push(`${id}: incorrect choice "${choice.id}" must have a misconception with a non-empty id and hint`)
      } else if (!catalog.misconceptions.includes(misconception.id)) {
        errors.push(`${id}: unknown misconception id "${misconception.id}"`)
      }
    })

    // Stable choice ids: "a", "b", "c", "d" in display order (EXERCISES §0.1).
    const expected = choiceIds.map((_, i) => String.fromCharCode(97 + i))
    if (choiceIds.length === choices.length && choiceIds.some((cid, i) => cid !== expected[i])) {
      errors.push(`${id}: choice ids must be "a", "b", … in display order`)
    }

    if (!isNonEmptyString(checkpoint.correctChoiceId) || !choiceIds.includes(checkpoint.correctChoiceId)) {
      errors.push(`${id}: correctChoiceId "${String(checkpoint.correctChoiceId)}" is not one of its choices`)
    }
  }

  // Rules 7 and 8: the result state.
  validateState(checkpoint.resultState, `${id} resultState`, exercise.terminology, errors)
}

export function validateExercise(input: unknown, catalog: Catalog): ValidationResult {
  if (!isObject(input)) return { ok: false, errors: ['exercise must be an object'] }

  const errors: string[] = []

  // Rule 1: top-level fields.
  if (!isNonEmptyString(input.id)) {
    errors.push('id must be a non-empty string')
  } else if (!EXERCISE_ID.test(input.id)) {
    errors.push(`exercise id "${input.id}" must look like "LL-01"`)
  }
  for (const key of ['moduleId', 'title', 'objective'] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`${key} must be a non-empty string`)
  }
  if (!Array.isArray(input.code) || input.code.length === 0) {
    errors.push('code must contain at least one line')
  } else if (!input.code.every((line) => typeof line === 'string')) {
    errors.push('code lines must be strings')
  }
  if (typeof input.terminology !== 'string' || !TERMINOLOGIES.includes(input.terminology)) {
    errors.push('terminology must be "generic-node" or "bignum-node"')
  }
  if (typeof input.visualization !== 'string' || !VISUALIZATIONS.includes(input.visualization)) {
    errors.push('visualization must be "linked-list" or "recursion"')
  }

  // Rules 7 and 8: the initial state.
  if (!isObject(input.initialState)) {
    errors.push('initialState must be an object')
  } else {
    validateState(input.initialState, 'initialState', input.terminology, errors)
  }

  // Rules 2–9: checkpoints.
  if (!Array.isArray(input.checkpoints)) {
    errors.push('checkpoints must be an array')
  } else if (input.checkpoints.length === 0) {
    errors.push('checkpoints must contain at least one checkpoint')
  } else {
    const seenIds = new Set<string>()
    input.checkpoints.forEach((checkpoint, i) => validateCheckpoint(checkpoint, i, input, catalog, seenIds, errors))
  }

  return errors.length === 0 ? { ok: true, exercise: input as unknown as Exercise } : { ok: false, errors }
}
