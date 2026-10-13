# TraceDS — Product Specification

## 1. One-line pitch

**TraceDS helps Data Structures & Algorithms students learn by predicting what
Java code does to memory, one step at a time, and then seeing it happen.**

## 2. Problem

Students preparing for a Java DSA exam often "read" linked-list code without
being able to *run it in their heads*. They mix up references and objects,
move `cur` and assume the list changed, lose the rest of a list during
insertion, and think a copy that shares nodes is a deep copy. Static slides
and multiple-choice quizzes test the final answer. They don't train the
step-by-step mental model.

## 3. Target users

Undergraduates in a Java-based Data Structures & Algorithms course who are
preparing for an exam. They reach TraceDS through a link in an email. They
may be on a laptop or a phone, often short on time, and won't create an
account.

**Implications:** no signup, a fast first load, a usable phone layout,
practice within one click, and essentially no onboarding.

## 4. Core learning loop

The visualization of program state is the product. Multiple choice is only
the mechanism that forces a prediction.

1. Show Java code and the current program/memory state.
2. Highlight the statement(s) about to execute (and the sub-expression in
   focus, e.g. `cur != null`).
3. Ask the student to predict what happens next.
4. The student selects a choice and presses **Check answer**.
5. **Incorrect:**
   - The state does **not** advance.
   - The correct answer is **not** revealed.
   - A conceptual hint aimed at the specific misconception behind that choice
     is shown.
   - The chosen option is marked "Not quite" and disabled. The student tries
     again.
6. **Correct:**
   - The visualization transitions to the resulting state, with changed parts
     highlighted.
   - A short explanation of *why* appears.
   - **Continue** moves to the next checkpoint.
7. After the last checkpoint, a completion screen shows results.

Because wrong choices are eliminated, every student finishes every checkpoint
within (number of choices) attempts. Nobody gets stuck, and there is no
"show answer" button.

## 5. Screens

| Screen | Contents | Primary action |
|---|---|---|
| **Landing** (`#/`) | Product name, one-sentence pitch, module cards (Linked Lists; Recursion "Coming soon" until M6) | Choose a module |
| **Module** (`#/m/linked-lists`) | Ordered exercises (LL-01 … LL-04) with title, one-line objective, and a "Completed" badge stored locally on this device | Start an exercise |
| **Exercise** (`#/x/LL-01`) | Code panel (left), memory visualization (right), output panel when relevant, question and choices (below), then feedback. Progress "Step 3 of 6". Collapsible "Node class" reference. Restart control. | Check answer → Continue |
| **Completion** (`#/x/LL-01/done`) | Summary: steps, first-try correct count, hints used. Next exercise, Restart, Back to module. Optional feedback survey (M8). | Next exercise |

There is no other navigation. There are no menus, profiles, settings, or
dashboards.

## 6. Content (V1)

| Id | Title | Priority | Status |
|---|---|---|---|
| LL-01 | References & Node Construction | P0 | Fully specified in EXERCISES.md |
| LL-02 | Linked List Traversal | P0 | Fully specified |
| LL-03 | Linked List Mutation | P0 | Fully specified |
| LL-04 | BigNum Deep Copy | P0 | Fully specified (uses the course's `clone()` verbatim) |
| REC-01 | Recursive Calls | P1 | Placeholder; awaiting course material |
| REC-02 | Recursive Unwinding | P1 | Placeholder; awaiting course material |

Linked lists outrank recursion. **The launch release is the linked-list MVP**
(M0–M4, then M7–M10). At launch
the Recursion card shows "Coming soon". Recursion (M5, M6) follows after
launch, once the course material arrives.

**Future modules (NOT in V1):** double-ended lists, circular lists, doubly
linked lists, Big-O, Quicksort, stacks. Their concepts may appear in
*explanations* (e.g. "this is why `myBack` gives O(1) insertion at the end"),
but no exercises are built for them.

## 7. Course terminology (binding)

TraceDS must use the course's own vocabulary. **These are never changed
silently.** Any deviation needs human approval.

There are two terminology sets. **They are never mixed** within an
exercise:

| Set | Used by | Identifiers |
|---|---|---|
| Generic linked list | LL-01, LL-02, LL-03 | `Node`, `head`, `data`, `next`, `cur`, `prev`, `null` |
| BigNum | LL-04 | `BigNum`, `Node`, `myHead`, `mySize`, `digit`, `next`, `copy`, `newPtr`, `origPtr` |

The course also uses `myBack` for double-ended lists. That's a future module
and isn't used in V1.

**Never use:** `ListNode`, `value`, `val`, `current`, `curr`, `getNext()`,
`setNext()`, or a `data` field on a BigNum Node.

**No invented names.** Student-facing code uses only course-established
identifiers. Don't introduce a convenience variable (`temp`, `newNode`,
`count`, `p`, …). If an exercise seems to need a name the course hasn't
established, flag it for human review instead.

Visual node style: `[data | next] → [data | next] → null` for generic lists,
and `[digit | next] → … → null` for BigNum. Reference variables
(`head`, `cur`, `prev`) point **directly at nodes**. Java references are shown
explicitly. They are never hidden behind getters or abstractions.

## 8. Design principles

**Feel:** polished, calm, modern, academic without looking institutional,
focused, visually intuitive.

**Avoid:** heavy gradients, gratuitous animation, gamification (points,
streaks, badges, confetti), childish styling, dense dashboards, extra
navigation, and chatbot/AI aesthetics (no chat bubbles, no sparkle icons).

**Visual language:**
- A neutral light surface, one restrained accent color for the "current
  step", and semantic colors for correct/incorrect that are *always* paired
  with an icon and text.
- Monospace code with clear line numbers. The current line has a background
  tint plus a left bar.
- Nodes are two-cell boxes `[ 4 | • ]` with arrows. `null` is an explicit
  small box. Variables are labelled pills above the node they reference.
- Transitions ≤ 300 ms, disabled under `prefers-reduced-motion`.

**Layout:** at ≥ 1024 px, code (left) and visualization (right) are visible at
the same time, with the question and feedback below. On smaller screens, the
panels stack vertically in the order code → visualization → question →
feedback.

## 9. Accessibility requirements

- Everything works with the keyboard: Tab order follows the visual order,
  arrow keys move within the choice radio group, Enter/Space submits, and
  focus moves to **Continue** after a correct answer and to the hint after an
  incorrect one.
- Focus states are visible on every interactive element.
- Text and UI contrast meets WCAG 2.1 AA (4.5:1 for text, 3:1 for UI
  components).
- Semantic controls: native `<button>`, `<input type="radio">`, `<fieldset>`,
  `<legend>`.
- **Correctness is never conveyed by color alone.** Use "✓ Correct" or "✗ Not
  quite", plus icons.
- Feedback is in an `aria-live="polite"` region. The visualization has a text
  description (ARCHITECTURE §6.3).
- The current code line has `aria-current="step"`.
- Touch targets are ≥ 44 × 44 px on mobile.

## 10. Non-goals (V1 scope rules)

No authentication, accounts, or profiles. No instructor dashboard or admin
panel. No AI-generated hints and no LLM calls. No code editor, arbitrary Java
input, or compiler/interpreter. No social features, leaderboards,
achievements, or streaks. No future modules. No server-side progress sync.
When sophistication and shipping conflict, **ship**.

## 11. Success criteria for launch

- A student can go from the emailed link to the first prediction in **≤ 2
  clicks** and **≤ 3 s** on a typical 4G phone (LCP target ≤ 2.5 s).
- All four LL exercises are completable on desktop and mobile Chrome/Safari.
- Practice works with the backend unreachable.
- The launch questions in ANALYTICS.md §6 can be answered from the database
  the next day.
