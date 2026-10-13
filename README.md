# TraceDS

**Learn data structures by predicting what Java code does to memory, one step
at a time.**

TraceDS is an interactive practice tool for undergraduates in a Java-based
Data Structures & Algorithms course. Each exercise shows Java code next to a
live picture of memory: nodes, references, and `null`. Before each statement
runs, the student predicts what will happen. A wrong prediction gets a
targeted conceptual hint and another try. A correct one animates the state
change and explains why it happened. There is no signup.

## Status

**M0–M3 are approved (LL-01 and LL-02 are playable). M4 (LL-03 and LL-04) is
in progress.** Run `npm install && npm run dev` in
`frontend/` and open the printed URL to try it. `frontend/`
contains the exercise engine and the memory-diagram renderer. There are no
exercise screens yet. To preview every diagram, run `npm run dev` in
`frontend/` and open `http://localhost:5173/?viz-harness`. The launch release is the
linked-list MVP. Recursion follows after launch.

## V1 content

| Exercise | Topic |
|---|---|
| LL-01 | References & Node Construction |
| LL-02 | Linked List Traversal |
| LL-03 | Linked List Mutation |
| LL-04 | BigNum Deep Copy |
| REC-01 / REC-02 | Recursive Calls / Unwinding (post-launch; pending course material) |

## Stack

React + TypeScript + Vite + Tailwind + React Flow (Vercel) · Go REST API
(Cloud Run) · PostgreSQL (Supabase) · GitHub Actions · Vitest, React Testing
Library, `go test`, Playwright.

## Documentation

- [PRODUCT.md](docs/PRODUCT.md): what we're building and for whom
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, types, API,
  schema, and decisions
- [EXERCISES.md](docs/EXERCISES.md): the exact exercise content contract
- [ANALYTICS.md](docs/ANALYTICS.md): anonymous events and launch queries
- [TESTING.md](docs/TESTING.md): the TDD test plan per milestone

## Repository layout (planned)

```
frontend/   React SPA (exercise engine, visualization, screens)
backend/    Go API (sessions, events, feedback, health)
docs/       Specification
```

Setup, run, and deploy instructions will be added as milestones M1, M7, and
M10 land.

## Privacy

TraceDS collects no names, emails, student IDs, or other personal
information. A random anonymous identifier is stored in your browser to
count usage in aggregate.
