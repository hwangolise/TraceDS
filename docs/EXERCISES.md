# TraceDS — Exercise Specification

This document is the **content contract** for V1 exercises. The TypeScript
exercise data files (`frontend/src/content/*.ts`) must be a faithful
transcription of this document. If the data and this document disagree, this
document wins until a human approves a change to it.

Related: [PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[TESTING.md](TESTING.md) · [ANALYTICS.md](ANALYTICS.md)

---

## 0. Conventions

### 0.1 Identifiers

| Thing | Format | Example |
|---|---|---|
| Module id | kebab-case | `linked-lists`, `recursion` |
| Exercise id | `XX-NN` | `LL-01` |
| Checkpoint (step) id | `<ex>-c<N>` lowercase, no hyphen in ex | `ll01-c3` |
| Choice id | single letter in display order | `a`, `b`, `c`, `d` |
| Concept id | kebab-case, from §0.4 | `aliasing` |
| Misconception id | kebab-case, from §0.5 | `assignment-copies-object` |
| Heap object id | capital letter, internal only | `A`, `B`, `X` |

**Step ids are permanent.** Analytics rows reference them. If the *meaning* of
a checkpoint changes (different question, different correct answer), it gets a
**new** step id. Fixing a typo does not require a new id.

Choices are displayed in the authored order (no shuffling) so tests and
analytics are deterministic. Authors must vary the position of the correct
answer across checkpoints.

### 0.2 State notation used in this document

Each state is written in a compact notation that maps 1:1 onto the
`ProgramState` type in [ARCHITECTURE.md §4.1](ARCHITECTURE.md#41-program-state):

```
frame main:   head → A, cur → null, n = 0
heap:         A: Node(4 | → B)
              B: Node(7 | null)
              X: BigNum(myHead → A, mySize = 3)
output:       "3", "8"
```

(This block only illustrates the notation. Real exercises never mix the
generic and BigNum terminology sets; see §0.6.)

- `name → A` — a reference variable/field referring to heap object `A`.
- `name → null` — a reference holding `null`.
- `name = 3` — an `int` variable/field.
- `name → ?` — an **unspecified** reference whose value the exercise
  deliberately does not claim (for example `copy.myHead` right after
  `new BigNum()` in LL-04). It is rendered as a dashed `?`, never as `null`
  and never as an arrow.
- `Node(4 | → B)` — a Node. Generic nodes render as `[data | next]`, and
  BigNum nodes render as `[digit | next]`. The field name is stored in the
  state, never inferred, and must match the exercise's terminology set
  (§0.6).
- Variables not listed in a frame **do not exist** (not yet declared, or out
  of scope).
- `output:` lists printed lines in order. Omitted means no output.
- `(unreachable)` is an annotation in this document only. Reachability is
  *derived* by the visualization, not stored in state.
- Object ids (`A`, `B`, …) are internal identities. **Students never see
  them.** Two nodes with equal digits but different ids are different objects.

### 0.3 Checkpoint anatomy

Every checkpoint defines: id, highlighted line(s), optional `focus` (the
sub-expression being evaluated, e.g. the condition of a `for` header), concept,
question, choices, correct choice, a misconception + hint for **every**
incorrect choice, the resulting state (full snapshot), and the explanation
shown after a correct answer.

### 0.4 Concepts (for analytics grouping)

| Concept id | Meaning |
|---|---|
| `dynamic-allocation` | `new` creates exactly one object; constructors initialise fields |
| `linking-nodes` | Assigning to a `next` field changes a link |
| `aliasing` | Several references can refer to the same object |
| `temp-references` | Moving a temporary reference doesn't change the list |
| `traversal` | Advancing `cur` through a list with `cur = cur.next` |
| `loop-termination` | How and when a traversal stops at `null` |
| `null-references` | What is and is not legal with `null` |
| `insertion` | Linking a new node into a list |
| `deletion` | Unlinking a node from a list |
| `deep-copy` | Copying a list into distinct Node objects |

### 0.5 Misconception catalog

Each wrong choice maps to exactly one misconception. The same misconception
may appear in several exercises and **must reuse the same id** so analytics can
aggregate across exercises.

| Misconception id | The student believes… |
|---|---|
| `ref-holds-value` | A `Node` variable stores the data itself |
| `next-auto-allocated` | Creating a node also creates the node after it |
| `assignment-deferred` | A new node isn't stored in its variable until it's linked |
| `field-assign-moves-variable` | Assigning `x.next = …` changes `x` itself |
| `dot-overwrites-data` | Assigning to `x.next` changes `x.data` |
| `links-bidirectional` | Linking A → B also links B → A |
| `assignment-copies-object` | `b = a` copies the object |
| `ref-to-variable` | A reference can refer to another variable |
| `assignment-moves` | `b = a` moves the value out of `a`, leaving it null |
| `alias-variables-linked` | Changing one alias variable changes the other variable |
| `moving-ref-mutates-list` | Moving a reference such as `cur` or `prev` changes the list structure |
| `temp-changes-dont-persist` | Changes made through a temporary reference don't affect the list |
| `stale-position` | A temporary reference is still where it was earlier |
| `loop-init-order` | A `for` loop's initialisation runs after its update |
| `update-before-first-iteration` | A `for` loop's update runs before the first iteration |
| `ref-vs-data` | `println(cur.data)` prints the Node object |
| `head-vs-cur` | The body reads through `head` rather than `cur` |
| `body-runs-all` | One iteration processes every remaining node |
| `wraps-to-head` | Traversal wraps back to `head` at the end of a list (circular) |
| `checks-next-not-cur` | The loop condition tests `cur.next != null` (off by one) |
| `counts-null` | `null` is processed as an extra element |
| `null-assign-fails` | Assigning `null` to a reference leaves the old value in place |
| `null-read-throws` | Reading a field whose value is `null` throws an exception |
| `null-compare-throws` | Comparing a reference to `null` throws an exception |
| `condition-checked-after-body` | The loop body runs once more before the condition is checked |
| `auto-append` | A new node is automatically added to the end of a list |
| `insert-before` | Linking after `prev` puts the node before `prev` |
| `rest-lost` | Overwriting `prev.next` loses the rest of the list, even though it was already passed along |
| `next-next-removed` | `x.next = x.next.next` removes the node two steps ahead |
| `removes-self` | `x.next = …` removes `x`'s own node |
| `front-insert-appends` | `new Node(v, head)` adds the node at the end |
| `rhs-evaluated-after` | A reference on the right side of an assignment already holds its new value |
| `head-not-updated` | `head = new Node(v, head)` doesn't change `head` |
| `new-returns-this` | `new BigNum()` inside `clone()` produces `this` |
| `implicit-this-field` | An unqualified field (`myHead`) inside `clone()` means `copy`'s field |
| `size-copies-list` | Copying `mySize` copies the digits too |
| `shallow-head` | `copy.myHead` can simply refer to the original `myHead` node |
| `constructor-copies-next` | `new Node(myHead.digit, null)` copies the original node's `next` |
| `new-copies-list` | One `new Node(...)` copies the whole list |
| `orig-starts-at-head` | `origPtr` starts at `myHead` rather than `myHead.next` |
| `copy-refs-original` | `newPtr` travels through the original list |
| `shallow-link` | The loop links the copy to the original nodes |
| `field-confusion` | Assigning `newPtr.next` overwrites `newPtr.digit` |
| `lockstep-same-digit` | `origPtr` and `newPtr` always refer to nodes with the same digit |
| `shallow-copy` | A finished copy shares Node objects with the original |

### 0.6 Terminology sets and reference classes

Every exercise uses exactly **one** terminology set (decision A1). The two
sets are never mixed: a generic exercise never mentions `digit` or `myHead`,
and a BigNum exercise never mentions a `data` field.

| Set | Exercises | Student-facing identifiers |
|---|---|---|
| Generic linked list (`generic-node`) | LL-01, LL-02, LL-03 | `Node`, `head`, `data`, `next`, `cur`, `prev`, `null` |
| BigNum (`bignum-node`) | LL-04 | `BigNum`, `Node`, `myHead`, `mySize`, `digit`, `next`, `copy`, `newPtr`, `origPtr`, `null` (plus Java's `this`) |

Student-facing code introduces **no other variable names** (decision A6). If
an exercise needs a name the course hasn't established, that part is flagged
for human review instead of inventing one. The terminology lint
(TESTING C6) enforces this list against each exercise's code.

The exercise screen has a collapsible **"Node class"** panel showing the class
used by that exercise.

**Generic Node (LL-01, LL-02, LL-03).** Approved (A1): it mirrors the course's
BigNum Node, with `data` in place of `digit`.

```java
public class Node {
    public int data;
    public Node next;

    public Node() {
        this(0, null);
    }

    public Node(int data) {
        this(data, null);
    }

    public Node(int data, Node next) {
        this.data = data;
        this.next = next;
    }
}
```

**BigNum Node (LL-04)** is exactly the course class:

```java
public class Node {
    public int digit;
    public Node next;

    public Node() {
        this(0, null);
    }

    public Node(int digit) {
        this(digit, null);
    }

    public Node(int digit, Node next) {
        this.digit = digit;
        this.next = next;
    }
}
```

For LL-04 the panel also lists the BigNum fields: `private Node myHead;` and
`private int mySize;`.

---

## LL-01 — References & Node Construction

- **Module:** `linked-lists`
- **Learning objective:** Predict the memory state as `Node` objects are
  allocated with `new` and linked through `next`. Distinguish a reference from
  the object it refers to. Recognise that two variables can refer to the same
  node, and that changes made through either one change that node.
- **Concepts:** dynamic-allocation, linking-nodes, aliasing, temp-references

### Java shown to student

```java
1  Node head = new Node(4);
2  head.next = new Node(7);
3  Node cur = head;
4  cur = cur.next;
5  cur.next = new Node(1, null);
6  cur.data = 9;
```

### Initial state

```
frame main:   (no variables)
heap:         (empty)
```

### ll01-c1 · line 1 · `dynamic-allocation`

**Question:** Line 1 runs. What does memory look like afterward?

- `a` ✗ — head holds the value 4 directly; no Node object is created.
  - Misconception: `ref-holds-value`
  - Hint: head is declared with type Node, not int. A Node variable holds a
    reference to a Node object. What does `new Node(4)` produce?
- `b` ✓ — head refers to a new Node whose data is 4 and whose next is null.
- `c` ✗ — head refers to a new Node with data 4, and its next refers to another
  new, empty Node.
  - Misconception: `next-auto-allocated`
  - Hint: Count the `new` expressions on line 1. Each `new` creates exactly
    one object. What does the one-argument constructor set next to?
- `d` ✗ — A Node with data 4 is created, but head stays null until the node is
  linked into a list.
  - Misconception: `assignment-deferred`
  - Hint: An assignment stores its right-hand value into the variable as soon
    as the statement runs. Nothing about linking is required first.

**Resulting state**

```
frame main:   head → A
heap:         A: Node(4 | null)
```

**Explanation:** `new Node(4)` allocates one Node object. The one-argument
constructor calls `this(4, null)`, so data is 4 and next is null. The `=`
stores a reference to that new node in head.

### ll01-c2 · line 2 · `linking-nodes`

**Question:** What changes after line 2?

- `a` ✗ — head now refers to the node containing 7.
  - Misconception: `field-assign-moves-variable`
  - Hint: The left side of the assignment is `head.next`, not `head`. Which
    one receives the new value, and which one is left alone?
- `b` ✗ — The data in head's node changes from 4 to 7.
  - Misconception: `dot-overwrites-data`
  - Hint: `head.next` names the next field of the node head refers to. The
    data field isn't mentioned on line 2.
- `c` ✓ — A new Node containing 7 is created, and the next field of the node
  containing 4 now refers to it. head is unchanged.
- `d` ✗ — A new Node containing 7 is created, and its next refers back to the
  node containing 4.
  - Misconception: `links-bidirectional`
  - Hint: One assignment changes exactly one field. In a singly linked list,
    links go one way. What does the one-argument constructor set the new
    node's next to?

**Resulting state**

```
frame main:   head → A
heap:         A: Node(4 | → B)
              B: Node(7 | null)
```

**Explanation:** The right side runs first: `new Node(7)` creates a node with
next = null. That reference is then stored in the next field of the node head
refers to. head itself still refers to the node containing 4.

### ll01-c3 · line 3 · `aliasing`

**Question:** After line 3, how many Node objects exist, and what does cur
refer to?

- `a` ✗ — 3 nodes: cur refers to a new copy of the node containing 4.
  - Misconception: `assignment-copies-object`
  - Hint: Is there a `new` on line 3? Assigning one reference variable to
    another copies the reference, not the object.
- `b` ✗ — 2 nodes: cur refers to the variable head.
  - Misconception: `ref-to-variable`
  - Hint: References point to objects, never to other variables. What object
    does head refer to at this moment?
- `c` ✗ — 2 nodes: the node moves to cur, so head becomes null.
  - Misconception: `assignment-moves`
  - Hint: Assignment reads head's value and copies it into cur. Reading a
    variable never changes it.
- `d` ✓ — 2 nodes: head and cur both refer to the node containing 4.

**Resulting state**

```
frame main:   head → A, cur → A
heap:         A: Node(4 | → B)
              B: Node(7 | null)
```

**Explanation:** `cur = head` copies the reference stored in head. Now two
variables refer to the same node. No new node is created.

### ll01-c4 · line 4 · `temp-references`

**Question:** After line 4, which statement is true?

- `a` ✓ — cur refers to the node containing 7. head still refers to the node
  containing 4.
- `b` ✗ — Both cur and head now refer to the node containing 7.
  - Misconception: `alias-variables-linked`
  - Hint: head and cur referred to the same node, but they are separate
    variables. Line 4 assigns only to cur.
- `c` ✗ — cur refers to the node containing 7, and the node containing 4 is
  removed from the list.
  - Misconception: `moving-ref-mutates-list`
  - Hint: Line 4 assigns to the variable cur only. No next field is assigned,
    so no link in the list changes.

**Resulting state**

```
frame main:   head → A, cur → B
heap:         A: Node(4 | → B)
              B: Node(7 | null)
```

**Explanation:** `cur.next` is read from the node cur refers to, giving the
node containing 7. That reference is stored in cur. Moving a temporary
reference doesn't change any node, and head is untouched.

### ll01-c5 · line 5 · `linking-nodes`

**Question:** What does line 5 do?

- `a` ✗ — Nothing in the list changes, because cur is only a temporary
  variable.
  - Misconception: `temp-changes-dont-persist`
  - Hint: cur refers to a real node in the list. `cur.next` is that node's
    next field. Assigning to it changes the node itself, whichever variable
    you used to reach it.
- `b` ✗ — cur now refers to the new node containing 1.
  - Misconception: `field-assign-moves-variable`
  - Hint: The left side is `cur.next`, not `cur`. Which one is assigned?
- `c` ✗ — The next field of the node containing 4 now refers to the new node.
  - Misconception: `stale-position`
  - Hint: Where does cur refer after line 4? `cur.next` is the next field of
    *that* node.
- `d` ✓ — The node containing 7 now links to a new node containing 1. The list
  from head is 4 → 7 → 1 → null.

**Resulting state**

```
frame main:   head → A, cur → B
heap:         A: Node(4 | → B)
              B: Node(7 | → C)
              C: Node(1 | null)
```

**Explanation:** cur refers to the node containing 7, so `cur.next = …`
changes that node's next field. Since the node is part of the list starting at
head, the list now has three nodes.

### ll01-c6 · line 6 · `aliasing`

**Question:** Line 6 runs. If you traverse the list from head, which values are
printed?

- `a` ✗ — 9, 7, 1
  - Misconception: `stale-position`
  - Hint: Which node does cur refer to right now? Line 4 moved it.
- `b` ✗ — 4, 7, 1
  - Misconception: `temp-changes-dont-persist`
  - Hint: cur and the list share the same Node objects. `cur.data = 9`
    changes the node cur refers to, and the list reaches that same node
    through `head.next`.
- `c` ✓ — 4, 9, 1

**Resulting state**

```
frame main:   head → A, cur → B
heap:         A: Node(4 | → B)
              B: Node(9 | → C)
              C: Node(1 | null)
```

**Explanation:** cur and `head.next` refer to the same node. Changing its data
through cur changes the one node both of them see.

### LL-01 golden path

`b, c, d, a, d, c` → completed. 6 checkpoints, 6 first-try correct, 0 hints.
The final state equals the state after `ll01-c6`.

### LL-01 wrong-answer tests

For **every** incorrect choice listed above:
1. Submitting it leaves `stepIndex`, `state`, and `phase` unchanged.
2. The returned feedback has exactly the listed misconception id and hint.
3. The choice is marked eliminated and can't be submitted again.
4. Then submitting the correct choice advances exactly one step with
   `attempt = (wrong attempts + 1)`.

Named cases that must exist explicitly (not only via the table-driven loop):
- `ll01-c3` choice `a` → `assignment-copies-object` (key aliasing misconception).
- `ll01-c5` choice `a` → `temp-changes-dont-persist`.
- `ll01-c6` all wrong choices tried in order `a, b` then `c` → attempt 3, two
  hints shown, step completed.

### LL-01 edge cases

- **Empty starting state.** The visualization must render "no variables yet"
  and an empty heap without errors.
- **Two references to one node** (after c3). Both head and cur arrows must
  point at node A, with their labels stacked without overlap.
- **Node with next = null** must render an explicit `null` terminator (see
  ARCHITECTURE §6).
- The `Node(1, null)` call on line 5 uses the two-argument constructor. The
  result must be identical to `new Node(1)`.

---

## LL-02 — Linked List Traversal

- **Module:** `linked-lists`
- **Learning objective:** Trace `cur` through a list using the course's
  standard `for` traversal. Predict the output, the loop variable's position,
  and exactly when and why the loop stops. Includes `null` and off-by-one
  reasoning.
- **Concepts:** traversal, temp-references, loop-termination, null-references

### Java shown to student

This is the course's standard traversal, verbatim:

```java
1  for(Node cur = head; cur != null; cur = cur.next) {
2      System.out.println(cur.data);
3  }
```

### Initial state

Execution is paused before the loop. head was built earlier and is not part
of the shown code.

```
frame main:   head → A
heap:         A: Node(3 | → B)
              B: Node(8 | → C)
              C: Node(5 | null)
```

### ll02-c1 · line 1 · focus `Node cur = head` · `traversal`

**Question:** The loop's initialization runs. What does cur refer to?

- `a` ✗ — null, because cur is assigned in the update step.
  - Misconception: `loop-init-order`
  - Hint: A for loop has three parts. The initialization runs once, first,
    before the condition is ever checked.
- `b` ✓ — The node containing 3, the same node head refers to.
- `c` ✗ — The node containing 8.
  - Misconception: `update-before-first-iteration`
  - Hint: The update `cur = cur.next` runs *after* each pass through the
    body. It doesn't run before the first one.
- `d` ✗ — A new copy of the node containing 3.
  - Misconception: `assignment-copies-object`
  - Hint: Is there a `new` here? `cur = head` copies a reference, not a node.

**Resulting state**

```
frame main:   head → A, cur → A
heap:         A: Node(3 | → B)
              B: Node(8 | → C)
              C: Node(5 | null)
```

**Explanation:** The initialization `Node cur = head` runs once. cur now refers
to the first node, the same node head refers to.

### ll02-c2 · line 2 · `traversal`

**Question:** `cur != null` is true, so the body runs. What does line 2 print?

- `a` ✓ — 3
- `b` ✗ — The Node object itself (something like `Node@1b6d3586`)
  - Misconception: `ref-vs-data`
  - Hint: Look at what's passed to println: `cur.data`, not `cur`. What is
    the data field of the node cur refers to?
- `c` ✗ — 8
  - Misconception: `update-before-first-iteration`
  - Hint: cur hasn't moved yet. The update runs after the body, so this pass
    uses the node cur was initialized to.

**Resulting state**

```
frame main:   head → A, cur → A
heap:         (unchanged)
output:       "3"
```

**Explanation:** cur refers to the node containing 3, so `cur.data` is 3.

### ll02-c3 · line 1 · focus `cur = cur.next` · `temp-references`

**Question:** The update runs. Which statement is true afterward?

- `a` ✗ — cur and head both refer to the node containing 8.
  - Misconception: `alias-variables-linked`
  - Hint: The update assigns only to cur. head is a separate variable, and
    nothing here assigns to it.
- `b` ✓ — cur refers to the node containing 8. head is unchanged.
- `c` ✗ — cur refers to the node containing 8, and the node containing 3 is
  unlinked from the list.
  - Misconception: `moving-ref-mutates-list`
  - Hint: `cur = cur.next` changes the variable cur only. No next field is
    assigned, so the list's links are unchanged.

**Resulting state**

```
frame main:   head → A, cur → B
heap:         (unchanged)
output:       "3"
```

**Explanation:** `cur.next` is read from the node containing 3, giving the
node containing 8. That reference is stored in cur. The list itself doesn't
change.

### ll02-c4 · lines 1–2 · focus `cur != null` · `traversal`

**Question:** The condition is checked again and the body runs. What is the
complete output so far?

- `a` ✗ — 3, 3
  - Misconception: `head-vs-cur`
  - Hint: The body prints `cur.data`, not `head.data`. Where does cur refer
    now?
- `b` ✗ — 3, 8, 5
  - Misconception: `body-runs-all`
  - Hint: One pass through the body handles one node. The loop only moves on
    to the next node in the update.
- `c` ✓ — 3, 8

**Resulting state**

```
frame main:   head → A, cur → B
heap:         (unchanged)
output:       "3", "8"
```

**Explanation:** cur isn't null, so the body runs for the node containing 8.
It prints 8.

### ll02-c5 · line 1 · focus `cur = cur.next` · `traversal`

**Question:** The update runs again. Where does cur refer?

- `a` ✓ — The node containing 5.
- `b` ✗ — The node containing 3, because traversal wraps back to head.
  - Misconception: `wraps-to-head`
  - Hint: Follow the next field of the node cur currently refers to. Does
    any node's next refer to the node containing 3?

**Resulting state**

```
frame main:   head → A, cur → C
heap:         (unchanged)
output:       "3", "8"
```

**Explanation:** The next field of the node containing 8 refers to the node
containing 5. In a list that ends in null, nothing points back to the front.

### ll02-c6 · lines 1–2 · focus `cur != null` · `loop-termination`

**Question:** cur refers to the last node. The condition is checked and the
body runs. What is the complete output afterward?

- `a` ✗ — 3, 8, because the last node is skipped when its next is null.
  - Misconception: `checks-next-not-cur`
  - Hint: Read the condition carefully. It tests `cur != null`, not
    `cur.next != null`. Is cur itself null right now?
- `b` ✓ — 3, 8, 5
- `c` ✗ — 3, 8, 5, null
  - Misconception: `counts-null`
  - Hint: The body runs only while cur refers to a node, and each pass prints
    that node's data. Is null a node?

**Resulting state**

```
frame main:   head → A, cur → C
heap:         (unchanged)
output:       "3", "8", "5"
```

**Explanation:** cur refers to a node, so `cur != null` is true even though
that node's next is null. The body prints 5.

### ll02-c7 · line 1 · focus `cur = cur.next` · `null-references`

**Question:** The update runs while cur refers to the last node. What happens?

- `a` ✗ — cur stays at the node containing 5, because there is no next node.
  - Misconception: `null-assign-fails`
  - Hint: The node does have a next field, and its value is null. Assigning
    null to cur is an ordinary assignment.
- `b` ✗ — A NullPointerException is thrown.
  - Misconception: `null-read-throws`
  - Hint: cur still refers to a real node, so reading `cur.next` is safe. The
    value it reads just happens to be null. An exception happens only when you
    use a dot on a null reference.
- `c` ✓ — cur becomes null.
- `d` ✗ — cur refers to the node containing 3.
  - Misconception: `wraps-to-head`
  - Hint: Look at the next field of the node containing 5. What value does it
    hold?

**Resulting state**

```
frame main:   head → A, cur → null
heap:         (unchanged)
output:       "3", "8", "5"
```

**Explanation:** The last node's next is null, so `cur = cur.next` stores null
in cur. Reading a null *value* is fine. Using a dot *on* null would throw.

### ll02-c8 · line 1 · focus `cur != null` · `loop-termination`

**Question:** The condition is checked with cur equal to null. What happens
next?

- `a` ✗ — The body runs one more time before the loop stops.
  - Misconception: `condition-checked-after-body`
  - Hint: A for loop checks its condition before every pass, including this
    one. What does `cur != null` evaluate to now?
- `b` ✓ — The loop ends. Nothing more is printed.
- `c` ✗ — A NullPointerException is thrown when `cur != null` is checked.
  - Misconception: `null-compare-throws`
  - Hint: Comparing a reference with `!=` doesn't use a dot, so nothing is
    dereferenced. The comparison simply evaluates to true or false.

**Resulting state**

`cur` is gone: it was declared in the `for` header, so it is out of scope once
the loop ends.

```
frame main:   head → A
heap:         (unchanged)
output:       "3", "8", "5"
```

**Explanation:** `cur != null` is false, so the loop exits. cur was declared in
the for header, so it no longer exists. Every node was printed exactly once.

### LL-02 golden path

`b, a, b, c, a, b, c, b` → completed. 8 checkpoints. Final output
`["3","8","5"]`, final frame has no `cur`.

### LL-02 wrong-answer tests

Same four assertions as LL-01 for every incorrect choice. Named cases:
- `ll02-c6` choice `a` → `checks-next-not-cur` (off-by-one, high-value).
- `ll02-c7` choice `b` → `null-read-throws`.
- `ll02-c8` choice `c` → `null-compare-throws`.
- `ll02-c7`: try `a`, `b`, `d` then `c` → attempt 4 and three hints. This is
  the maximum number of attempts in the module.

### LL-02 edge cases

- **Variable removal.** After c8, `cur` disappears from the frame. The
  visualization must drop the cur label and arrow (not render `cur → null`).
- **Output panel** grows line by line. It must handle 0 lines (initial) and
  3 lines (final).
- **`cur → null`** (after c7) must render as a reference to an explicit null
  marker, not as a missing variable.
- **Multiple statements per checkpoint** (c4, c6) highlight a set of
  lines. The `focus` label names the sub-expression.
- *(Documented, not interactive in V1)* An empty list (`head == null`) runs
  the body zero times and prints nothing. This would be added to the c8
  explanation only if a human approves.

---

## LL-03 — Linked List Mutation

- **Module:** `linked-lists`
- **Learning objective:** Reason about how insertion and deletion change
  references. Covers inserting after a node in one statement, moving a
  reference without changing the list, unlinking with
  `prev.next = prev.next.next`, unreachable nodes, and why inserting at the
  front must update head.
- **Concepts:** insertion, deletion, temp-references, linking-nodes

### Java shown to student

Only course-established names are used: `head`, `prev`, `data`, `next`, and
`null`. No extra variable is introduced. Insertion uses the one-statement form
`prev.next = new Node(5, prev.next);`, which needs no temporary variable (see
*Flagged for human review* at the end of this exercise).

```java
 1  // prev refers to the node containing 2
 2  prev.next = new Node(5, prev.next);
 3
 4  // Move prev forward one node
 5  prev = prev.next;
 6
 7  // Remove the node after prev
 8  prev.next = prev.next.next;
 9
10  // Insert 1 at the front
11  head = new Node(1, head);
```

Lines 1, 3, 4, 6, 7, 9, and 10 are comments or blank lines and are never
highlighted.

### Initial state

The list is sorted, and prev has already been positioned.

```
frame main:   head → A, prev → A
heap:         A: Node(2 | → B)
              B: Node(6 | → C)
              C: Node(9 | null)
```

### ll03-c1 · line 2 · `insertion`

**Question:** After line 2, which values are in the list starting at head?

- `a` ✗ — 2, 5
  - Misconception: `rest-lost`
  - Hint: Java evaluates the right side first. `new Node(5, prev.next)` reads
    prev.next *before* it is overwritten. What did prev.next refer to at that
    moment?
- `b` ✗ — 5, 2, 6, 9
  - Misconception: `insert-before`
  - Hint: head still refers to the node containing 2, because line 2 doesn't
    assign head. The new node goes into prev's next field, which is *after*
    prev's node.
- `c` ✓ — 2, 5, 6, 9
- `d` ✗ — 2, 6, 9, 5
  - Misconception: `auto-append`
  - Hint: A node's position depends only on which next fields refer to it.
    Which next field is assigned on line 2?

**Resulting state**

```
frame main:   head → A, prev → A
heap:         A: Node(2 | → D)
              B: Node(6 | → C)
              C: Node(9 | null)
              D: Node(5 | → B)
```

**Explanation:** The right side runs first. `new Node(5, prev.next)` creates a
node whose next is the node containing 6. Then that new node is stored in
prev.next. Because the rest of the list was passed to the constructor before
prev.next changed, nothing is lost.

### ll03-c2 · line 5 · `temp-references`

**Question:** After line 5, which statement is true?

- `a` ✓ — prev refers to the node containing 5. The list is unchanged: 2, 5,
  6, 9.
- `b` ✗ — prev refers to the node containing 5, and the node containing 2 is
  removed from the list.
  - Misconception: `moving-ref-mutates-list`
  - Hint: Line 5 assigns the variable prev only. No next field is assigned,
    so no link in the list changes.
- `c` ✗ — prev and head both refer to the node containing 5.
  - Misconception: `alias-variables-linked`
  - Hint: head and prev referred to the same node, but they are separate
    variables. Line 5 assigns only to prev.

**Resulting state**

```
frame main:   head → A, prev → D
heap:         (unchanged)
```

**Explanation:** prev moves one node forward. It now refers to the node just
before the one we're about to remove, which is exactly what deletion in a
singly linked list needs.

### ll03-c3 · line 8 · `deletion`

**Question:** Which node does line 8 remove from the list?

- `a` ✗ — The node containing 9. The list becomes 2, 5, 6.
  - Misconception: `next-next-removed`
  - Hint: `prev.next.next` is the node two steps after prev. It's the node
    being linked *to*. Which node does the new link skip over?
- `b` ✓ — The node containing 6. The list becomes 2, 5, 9.
- `c` ✗ — The node containing 5. The list becomes 2, 6, 9.
  - Misconception: `removes-self`
  - Hint: Line 8 assigns `prev.next`, the link going *out* of prev's node.
    prev's node stays where it is. Only what comes after it changes.

**Resulting state**

```
frame main:   head → A, prev → D
heap:         A: Node(2 | → D)
              B: Node(6 | → C)      (unreachable)
              C: Node(9 | null)
              D: Node(5 | → C)
```

**Explanation:** prev's node now skips over the node containing 6. That node
isn't destroyed by line 8, and its next field still refers to 9. But nothing
refers to it any more, so it's unreachable, and Java's garbage collector will
eventually reclaim it.

### ll03-c4 · line 11 · `insertion`

**Question:** After line 11, which values are in the list starting at head?

- `a` ✗ — 2, 5, 9, 1
  - Misconception: `front-insert-appends`
  - Hint: The new node's next is set to the value of head, which is the node
    at the front. Where does that put the new node?
- `b` ✗ — 1
  - Misconception: `rhs-evaluated-after`
  - Hint: Java evaluates the whole right side, including reading head,
    before it assigns to head. What did head refer to at that moment?
- `c` ✗ — 2, 5, 9. The node containing 1 is created, but head still refers to
  the node containing 2.
  - Misconception: `head-not-updated`
  - Hint: Look at the left side of line 11. Which variable is assigned?
- `d` ✓ — 1, 2, 5, 9

**Resulting state**

Node B has been garbage collected and is removed from the heap. This keeps
the final picture clean; the explanation for c3 already told the student this
would happen.

```
frame main:   head → E, prev → D
heap:         E: Node(1 | → A)
              A: Node(2 | → D)
              D: Node(5 | → C)
              C: Node(9 | null)
```

**Explanation:** `new Node(1, head)` reads head's current value, the node
containing 2, and uses it as the new node's next. Then head is reassigned to
the new node. Inserting at the front is the one insertion that must update
head. It uses the same pattern as line 2: `new Node(value, <rest of list>)`.

### LL-03 golden path

`c, a, b, d` → completed. 4 checkpoints. The final list from head is
1 → 2 → 5 → 9 → null.

### LL-03 wrong-answer tests

Same four assertions for every incorrect choice. Named cases:
- `ll03-c1` choice `a` → `rest-lost`.
- `ll03-c3` choice `a` → `next-next-removed`.
- `ll03-c4` choice `b` → `rhs-evaluated-after`.

### LL-03 edge cases

- **Unreachable node** (after c3: B). It must render visually de-emphasized,
  with the text label "unreachable", and its outgoing edge to C still visible.
  Reachability is derived (ARCHITECTURE §6.2) and must not be stored in
  content.
- **Removal from heap** (after c4). Node B disappears between states without
  breaking the layout.
- **Head reassignment** (c4). The new front node must be laid out to the left
  of A on head's row.
- **Reference moves without list change** (c2). The prev pill moves from A to
  D, and the diff reports only the variable change.
- *(Explanations only, not interactive in V1)*:
  - Inserting into an empty list: `head = new Node(1, head)` works when head is
    null, because the new node's next becomes null.
  - Deleting when `prev.next` is null: `prev.next.next` throws
    NullPointerException. Code must check `prev.next != null` first.
  - Sorted insertion needs a traversal to find prev, which is O(n). Front
    insertion is O(1).

### Flagged for human review (non-blocking)

The original draft used a two-statement insertion with a temporary variable
for the new node. That taught *why the order of the two link updates
matters*. The course's standard name for that variable is unknown, so per
decision A6 the exercise now uses the one-statement form instead. If the
course teaches the two-statement form, please supply the course's variable
name. A checkpoint on link-update order can then be added, with **new** step
ids (`ll03-c5`, …), without changing the existing ones.

---

## LL-04 — BigNum Deep Copy

- **Module:** `linked-lists`
- **Learning objective:** Trace the course's BigNum `clone()`. Explain why it
  must create distinct Node objects, and tell a correct deep copy apart from
  aliasing (`copy` and `this` being the same object) or a shallow copy
  (`copy.myHead` referring to the original `myHead`).
- **Concepts:** deep-copy, aliasing, null-references, traversal,
  loop-termination
- **Terminology:** BigNum only: `BigNum`, `Node`, `myHead`, `mySize`, `digit`,
  `next`, `copy`, `newPtr`, `origPtr`. Field names from the
  generic set never appear in this exercise.

### Java shown to student

This is the course's `clone()` implementation, verbatim:

```java
 1  public BigNum clone() {
 2      BigNum copy = new BigNum();
 3      copy.mySize = mySize;
 4
 5      if (myHead != null) {
 6          copy.myHead = new Node(myHead.digit, null);
 7
 8          Node newPtr = copy.myHead;
 9
10          for (Node origPtr = myHead.next;
11               origPtr != null;
12               origPtr = origPtr.next) {
13
14              newPtr.next = new Node(origPtr.digit, null);
15              newPtr = newPtr.next;
16          }
17      }
18
19      return copy;
20  }
```

**What this exercise deliberately does not claim** (decisions A2, A4, A5):
- It does not claim what the `BigNum()` constructor stores in `copy.myHead`.
  After line 2 that field is shown as **unspecified** (`?`, ARCHITECTURE
  §4.1), and line 6 overwrites it. If the constructor created any objects,
  they are not modelled.
- It does not claim which end of the list holds the most significant digit.
  Digits are only ever described in list order, never as "the number 472".
- It does not claim that every BigNum has at least one digit. The `if` on
  line 5 is discussed only in terms of what the code does.

### Initial state

Execution is paused at the start of `clone()`, called on a BigNum whose list
holds the digits 4, 7, 2 in list order.

```
frame clone(): this → X
heap:          X: BigNum(myHead → A, mySize = 3)
               A: Node(4 | → B)        (digit field)
               B: Node(7 | → C)
               C: Node(2 | null)
```

### ll04-c1 · lines 2–3 · `aliasing`

**Question:** After lines 2 and 3, which statement about copy is true?

- `a` ✗ — copy refers to the same BigNum object as this.
  - Misconception: `new-returns-this`
  - Hint: `new BigNum()` always allocates a brand-new object. Is there any
    assignment that makes copy refer to this?
- `b` ✗ — copy is a new BigNum whose list already holds the digits 4, 7, 2.
  - Misconception: `size-copies-list`
  - Hint: Line 3 copies one int, mySize. The constructor on line 2 knows
    nothing about this BigNum's nodes. Which line would have to copy them?
- `c` ✓ — copy refers to a new, separate BigNum whose mySize is now 3. None of
  this BigNum's digits have been copied yet.

**Resulting state**

```
frame clone(): this → X, copy → Y
heap:          X: BigNum(myHead → A, mySize = 3)
               Y: BigNum(myHead → ?, mySize = 3)
               A: Node(4 | → B)
               B: Node(7 | → C)
               C: Node(2 | null)
```

**Explanation:** `new BigNum()` creates a second, separate BigNum. `mySize` on
the right means `this.mySize`, so line 3 copies the int value 3 and nothing else.
This exercise doesn't need to know what the constructor put in copy.myHead
(shown as `?`), because line 6 will assign it.

### ll04-c2 · line 5 · focus `myHead != null` · `null-references`

**Question:** The condition `myHead != null` is evaluated. What happens?

- `a` ✗ — It's false, because copy.myHead hasn't been given a node yet.
  - Misconception: `implicit-this-field`
  - Hint: Inside `clone()`, an unqualified field name like `myHead` means
    `this.myHead`, the original BigNum's field. copy's field is always written
    `copy.myHead`.
- `b` ✓ — It's true: myHead (this BigNum's head) refers to the node containing
  4, so the body of the if runs.

**Resulting state:** unchanged from ll04-c1. A checkpoint may leave state
unchanged; see ARCHITECTURE §4.3.

**Explanation:** `myHead` here is `this.myHead`, which refers to the node
containing 4, so the if body runs. The check guards line 6: `myHead.digit`
uses a dot on myHead, which would throw a NullPointerException if myHead
were null.

### ll04-c3 · line 6 · `deep-copy`

**Question:** After line 6, what does copy.myHead refer to?

- `a` ✗ — The same node that myHead refers to. Copying the head reference is
  enough.
  - Misconception: `shallow-head`
  - Hint: If copy.myHead referred to the original node, the two BigNums would
    share nodes, and changing a digit in copy would change the original too.
    What does the `new` on line 6 create?
- `b` ✗ — A new node containing 4, whose next refers to the original node
  containing 7.
  - Misconception: `constructor-copies-next`
  - Hint: Look at the arguments: `new Node(myHead.digit, null)`. Only the
    digit is taken from the original node. What is passed for next?
- `c` ✗ — A new node containing 4, followed by new copies of 7 and 2.
  - Misconception: `new-copies-list`
  - Hint: `new Node(...)` creates exactly one node. Copying the rest of the
    list is the job of the loop that follows.
- `d` ✓ — A new, separate node containing 4, whose next is null.

**Resulting state**

```
frame clone(): this → X, copy → Y
heap:          X: BigNum(myHead → A, mySize = 3)
               Y: BigNum(myHead → D, mySize = 3)
               A: Node(4 | → B)
               B: Node(7 | → C)
               C: Node(2 | null)
               D: Node(4 | null)
```

**Explanation:** Only the int digit is read from the original node. A brand-new
node holds that digit, so the copy's first node is a different object from
the original's, even though both contain 4. This is what makes the copy deep.

### ll04-c4 · lines 8, 10 · focus `Node origPtr = myHead.next` · `deep-copy`

**Question:** Line 8 runs, and then the for loop's initialization. Where do
newPtr and origPtr refer?

- `a` ✓ — newPtr refers to the copy's node containing 4. origPtr refers to the
  original node containing 7.
- `b` ✗ — newPtr refers to the copy's node containing 4. origPtr refers to the
  original node containing 4.
  - Misconception: `orig-starts-at-head`
  - Hint: The initialization reads `myHead.next`, not `myHead`. The first
    digit was already copied on line 6. Which original node should be copied
    next?
- `c` ✗ — newPtr refers to the original node containing 4, since that's where
  the digit came from. origPtr refers to the original node containing 7.
  - Misconception: `copy-refs-original`
  - Hint: copy.myHead was given a newly created node on line 6. newPtr gets
    that same reference, which is a node in the copy, not the original.

**Resulting state**

```
frame clone(): this → X, copy → Y, newPtr → D, origPtr → B
heap:          (unchanged)
```

**Explanation:** newPtr marks the last node in the copy, which is where the
next new node will be attached. origPtr marks the next original node still to
be copied.

### ll04-c5 · lines 11, 14 · focus `origPtr != null` · `deep-copy`

**Question:** `origPtr != null` is true, so the loop body starts. What does
line 14 do?

- `a` ✗ — It sets newPtr.next to origPtr, linking the copy's node containing 4
  to the original node containing 7.
  - Misconception: `shallow-link`
  - Hint: Look at the right side of line 14: `new Node(origPtr.digit, null)`.
    It reads just the int from the original node and builds a different node
    with it.
- `b` ✓ — It creates a new node containing 7 and links it after the copy's node
  containing 4.
- `c` ✗ — It overwrites the digit in the copy's node containing 4 with 7.
  - Misconception: `field-confusion`
  - Hint: The left side is `newPtr.next`, a link, not `newPtr.digit`. Which
    field of the copy's node is assigned?

**Resulting state**

```
frame clone(): this → X, copy → Y, newPtr → D, origPtr → B
heap:          X: BigNum(myHead → A, mySize = 3)
               Y: BigNum(myHead → D, mySize = 3)
               A: Node(4 | → B)
               B: Node(7 | → C)
               C: Node(2 | null)
               D: Node(4 | → E)
               E: Node(7 | null)
```

**Explanation:** Each pass makes one new node from one original digit and
attaches it to the end of the copy. The original list isn't touched.

### ll04-c6 · lines 12, 15 · focus `origPtr = origPtr.next` · `traversal`

**Question:** Line 15 runs, and then the loop's update. Where do newPtr and
origPtr refer?

- `a` ✗ — newPtr refers to the copy's node containing 7. origPtr refers to the
  original node containing 7.
  - Misconception: `lockstep-same-digit`
  - Hint: origPtr always marks the next original node still to be copied. The
    original 7 has just been copied, so where should origPtr go?
- `b` ✗ — newPtr refers to the original node containing 7. origPtr refers to
  the original node containing 2.
  - Misconception: `copy-refs-original`
  - Hint: `newPtr.next` is the node created on line 14, which belongs to the
    copy. newPtr only ever moves through the copy's list.
- `c` ✓ — newPtr refers to the copy's node containing 7. origPtr refers to the
  original node containing 2.

**Resulting state**

```
frame clone(): this → X, copy → Y, newPtr → E, origPtr → C
heap:          (unchanged)
```

**Explanation:** Both pointers advance one node along their own list. newPtr
stays on the copy's last node, and origPtr stays one node ahead in the
original.

### ll04-c7 · lines 11, 12, 14, 15 · focus `origPtr != null` · `loop-termination`

**Question:** `origPtr != null` is still true, so the loop body runs again,
followed by the update. Which statement is true afterward?

- `a` ✓ — The copy contains 4, 7, 2, and origPtr is null.
- `b` ✗ — The loop stopped before this pass because origPtr.next is null, so
  the copy contains only 4, 7.
  - Misconception: `checks-next-not-cur`
  - Hint: The loop condition tests `origPtr != null`. origPtr refers to the
    original node containing 2, so it isn't null yet.
- `c` ✗ — A NullPointerException is thrown by the update
  `origPtr = origPtr.next`, because origPtr.next is null.
  - Misconception: `null-read-throws`
  - Hint: origPtr still refers to a real node when the update runs, so reading
    origPtr.next is safe. The value it reads is null, and storing null is
    fine.

**Resulting state**

```
frame clone(): this → X, copy → Y, newPtr → F, origPtr → null
heap:          X: BigNum(myHead → A, mySize = 3)
               Y: BigNum(myHead → D, mySize = 3)
               A: Node(4 | → B)
               B: Node(7 | → C)
               C: Node(2 | null)
               D: Node(4 | → E)
               E: Node(7 | → F)
               F: Node(2 | null)
```

**Explanation:** The last original digit is copied into a new node. Then the
update moves origPtr to null, so the next condition check will be false.

### ll04-c8 · lines 11, 19 · focus `origPtr != null` · `deep-copy`

**Question:** origPtr is null, so the loop ends, the if block ends, and
`clone()` returns copy. Which statement is true?

- `a` ✗ — copy and this refer to the same BigNum object.
  - Misconception: `new-returns-this`
  - Hint: copy was assigned `new BigNum()` on line 2, and it was never
    reassigned. Follow the copy and this arrows in the picture.
- `b` ✗ — The two BigNums share the same three nodes. Only the BigNum objects
  are different.
  - Misconception: `shallow-copy`
  - Hint: Look back at lines 6 and 14. Each digit was put into a node made by
    `new`. Did any line store an original node's reference in the copy?
- `c` ✓ — The two BigNums are different objects, and each has its own three
  nodes with the same digits. Changing a digit in one doesn't affect the
  other.

**Resulting state**

origPtr was declared in the for header and newPtr inside the if block, so
both are out of scope.

```
frame clone(): this → X, copy → Y
heap:          (unchanged from ll04-c7)
```

**Explanation:** This is a deep copy. Two BigNum objects and six Node objects
exist, and no node is shared between the two lists. If line 6 had been
`copy.myHead = myHead`, both BigNums would share one list of nodes, and
changing either one would change "both".

### LL-04 golden path

`c, b, d, a, b, c, a, c` → completed. 8 checkpoints. The final frame holds
only `this` and `copy`. The final heap has 2 BigNum and 6 Node objects. The
node sets reachable from `X.myHead` and from `Y.myHead` are disjoint, and
their digit sequences are equal (4, 7, 2).

### LL-04 wrong-answer tests

Same four assertions for every incorrect choice. Named cases:
- `ll04-c3` choice `a` → `shallow-head`. **This is the headline misconception.
  It must have its own named test.**
- `ll04-c2` choice `a` → `implicit-this-field`.
- `ll04-c5` choice `a` → `shallow-link`.
- `ll04-c8` choice `b` → `shallow-copy`.
- `ll04-c7` choice `b` → `checks-next-not-cur`. The id is shared with LL-02
  for cross-exercise aggregation.

### LL-04 edge cases

- **Equal digits, distinct objects.** The visualization must keep the
  original and the copy on separate rows, so equal digits are never mistaken
  for the same node. Edges from the copy must never cross into the original's
  row.
- **BigNum object rendering.** BigNum renders as a box with `myHead` and
  `mySize` fields.
- **Unspecified field** (after c1 and c2: `Y.myHead → ?`). It renders as a
  dashed `?` marker captioned "set by BigNum()", never as `null` and never as
  an arrow. In the text description it reads "copy's myHead: not shown in
  this exercise".
- **Scope exit** (c8). newPtr and origPtr disappear from the frame together.
- **Unchanged-state checkpoint** (c2) advances normally.
- **Not modelled:** the `myHead == null` path through the `if`, and anything
  `BigNum()` allocates. These stay out until course material establishes
  BigNum's empty representation (decisions A2 and A5).

---

## REC-01 — Recursive Calls *(placeholder, not finalized)*

> **Status:** Waiting on course material. Do **not** author checkpoints,
> code, or misconceptions until a human provides the recursion course
> material.

- **Module:** `recursion`
- **Intended learning objective:** Trace a recursive method as it is called.
  Predict the arguments of each new call, see a new stack frame pushed for
  each call, and identify the base case and the call where it is reached.
- **Intended interaction:** Same engine and checkpoint model as the LL
  exercises. Questions ask "what are the arguments of the next call?", "is
  this the base case?", and "how many frames are on the stack now?"
- **Architecture notes:**
  - Uses the same `ProgramState`. Recursion uses `frames` with **more than one
    frame**: each frame has a method name, a call-site label, and its own
    local variables (ARCHITECTURE §4.1).
  - Rendered by the recursion visualization (M5): a vertical call stack, with
    the top frame emphasized. Heap objects are optional.
  - Concept ids are expected to include `base-case`, `recursive-case`,
    `stack-frames`, and `parameter-binding`. These are final only after
    content review.

## REC-02 — Recursive Unwinding *(placeholder, not finalized)*

> **Status:** Waiting on course material. Same restrictions as REC-01.

- **Module:** `recursion`
- **Intended learning objective:** Predict the return values as frames pop off
  the stack. Understand that each pending call resumes where it left off and
  combines the returned value with its own local state.
- **Intended interaction:** Checkpoints at each `return`. Questions ask "what
  does this call return?", "which frame resumes next?", and "what is the final
  result?"
- **Architecture notes:**
  - Needs frames to show a pending-return annotation (for example
    `returns 6`), shown as a frame-level field in the visualization.
  - Popping a frame is a state transition in which the frame list gets
    shorter. The recursion visualization must animate or highlight the removal.
  - Concept ids are expected to include `return-values`, `unwinding`, and
    `pending-computation`. These are final only after content review.
