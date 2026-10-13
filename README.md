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

**M0–M4 are approved; all four linked-list exercises are playable. M7
(backend and anonymous analytics) is implemented and awaiting review
and acceptance.** The launch release is the linked-list MVP; recursion follows after
launch.

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

## Local development

Requires Node 24, Go 1.25, and PostgreSQL 16 (a local install or Docker).
All credentials below are local placeholders. Never commit real ones.

### Frontend only (no analytics)

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Without `VITE_API_BASE_URL` analytics is a no-op and learning works fully.
`http://localhost:5173/?viz-harness` previews every diagram (dev only).

### Local PostgreSQL and the API

```bash
# 1. PostgreSQL 16 (Docker shown; any local Postgres 16 works)
docker run -d --name traceds-pg -p 5433:5432 \
  -e POSTGRES_USER=traceds -e POSTGRES_PASSWORD=traceds -e POSTGRES_DB=traceds \
  postgres:16

# 2. Apply the schema (plain SQL, no migration framework)
psql "postgres://traceds:traceds@localhost:5433/traceds?sslmode=disable" \
  -f backend/migrations/0001_init.sql

# 3. Run the API
cd backend
DATABASE_URL="postgres://traceds:traceds@localhost:5433/traceds?sslmode=disable" \
ALLOWED_ORIGINS="http://localhost:5173" \
PORT=8080 go run ./cmd/server
curl http://localhost:8080/api/v1/health    # {"database":"ok","status":"ok"}

# 4. Frontend with analytics pointed at the local API
cd frontend && VITE_API_BASE_URL=http://localhost:8080 npm run dev
```

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | backend (required) | PostgreSQL connection string |
| `ALLOWED_ORIGINS` | backend | Comma-separated CORS allowlist (exact origins; `*` is ignored) |
| `PORT` | backend | Listen port (default `8080`; Cloud Run injects it) |
| `VITE_API_BASE_URL` | frontend (build time) | API origin. Unset or empty disables analytics |
| `VITE_APP_VERSION` | frontend (build time) | Optional version string sent with the session |

### Tests

```bash
# Frontend
cd frontend
npm test              # Vitest
npm run typecheck
npm run lint
npm run build
npx playwright install chromium   # once
npx playwright test --workers=1   # E2E; serial, as in CI (P4 is latency-sensitive)

# Backend
cd backend
gofmt -l .            # must print nothing
go vet ./... && go vet -tags=integration ./...
go test -race ./...   # unit tests (in-memory store)
# Integration tests need an empty PostgreSQL 16 database; each test makes and
# drops its own schema.
TEST_DATABASE_URL="postgres://traceds:traceds@localhost:5433/traceds?sslmode=disable" \
  go test -race -tags=integration ./...
```

### Backend container

```bash
docker build -t traceds-api backend/   # multi-stage → distroless, non-root, binary only
```

### Deployment note (M10)

With the Supabase **transaction pooler** (port 6543), `DATABASE_URL` must
include `default_query_exec_mode=simple_protocol` (ARCHITECTURE §9.4), for
example `postgres://<user>:<password>@<pooler-host>:6543/postgres?default_query_exec_mode=simple_protocol`.
Without it, every insert fails and analytics is silently lost. Full deploy
steps arrive with M10.

## Privacy

TraceDS collects no names, emails, student IDs, or other personal
information. A random anonymous identifier is stored in your browser to
count usage in aggregate.
