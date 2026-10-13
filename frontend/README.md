# TraceDS frontend

React + TypeScript + Vite single-page app. See the specification in
[`../docs`](../docs).

```bash
npm install
npm test            # Vitest (vitest run)
npm run typecheck   # tsc -b
npm run lint        # oxlint (includes the engine import-boundary rule)
npm run build       # production build
npm run dev         # local dev server
```

## Layout (so far)

- `src/engine/`: the pure, deterministic exercise engine (`types.ts`,
  `engine.ts`, `validate.ts`). It has no React, network, storage, or clock
  dependencies.
- `src/content/`: exercise content data (`catalog.ts` for now).
- `tests/`: Vitest tests that mirror `src/`, plus `tests/fixtures/`.
