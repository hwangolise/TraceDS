# TraceDS

**Learn data structures by predicting what Java code does to memory, one step
at a time.**

TraceDS is an interactive practice tool for undergraduates in a Java-based
Data Structures & Algorithms course. Each exercise shows Java code next to a
live picture of memory: nodes, references, and `null`. Before each statement
runs, the student predicts what will happen. A wrong prediction gets a
targeted conceptual hint and another try. A correct one animates the state
change and explains why it happened. There is no signup.

## Production

**Live: https://trace-ds-lemon.vercel.app**

| Piece | Where |
|---|---|
| Frontend (static SPA, hash routing) | Vercel, project root `frontend/` |
| API | Cloud Run service `traceds-api`, project `traceds-yh`, region `us-west1` (`https://traceds-api-833265331667.us-west1.run.app`) |
| Database | Supabase PostgreSQL (West US, Oregon), reached through the transaction pooler |

## Status

**M0–M4, M7–M10 are complete. The linked-list MVP (LL-01..04)
is live and ready for students.** Recursion (M5/M6) is post-launch work and
waits for course material.

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

## Repository layout

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

## Deployment and rollback

Deploys are manual (decision Q7). No credentials live in the repository;
`.env` and `.env.*` are git-ignored. Never paste a connection string into a
doc, issue, or commit.

- **Database:** Supabase. The schema is applied once with
  `psql "<connection string>" -f backend/migrations/0001_init.sql`. RLS is on for
  all three tables with no policies, and the Supabase Data API is disabled.
  Future schema changes are **forward migrations** (new numbered SQL files).
  Do not drop or roll back production tables once students have generated data.
- **API:** `gcloud run deploy traceds-api --source backend/ --region us-west1`.
  `DATABASE_URL` comes from Google Secret Manager (mounted as an env var).
  `ALLOWED_ORIGINS` is the Vercel production origin only. With the transaction
  pooler (port 6543) the URL must include
  `default_query_exec_mode=simple_protocol` (ARCHITECTURE §9.4), or inserts
  fail and analytics is silently lost.
- **Frontend:** Vercel builds `frontend/` (`npm run build`, output `dist/`). Its
  only configuration is public: `VITE_API_BASE_URL` (the Cloud Run origin)
  and `VITE_APP_VERSION`. Both are read at build time, so changing either
  needs a redeploy.
- **Health:** `GET /api/v1/health` returns `{"database":"ok","status":"ok"}`.

**Rollback**
- Frontend: promote a previous production deployment in Vercel (Instant
  Rollback). If analytics itself is the problem, redeploy with
  `VITE_API_BASE_URL` unset. Analytics becomes a no-op and the learning
  experience is unchanged.
- API: move Cloud Run traffic to the previous revision
  (`gcloud run services update-traffic traceds-api --region us-west1 --to-revisions <revision>=100`).
- Database: do not casually roll back or drop tables. Fix forward.

## Privacy

TraceDS collects no names, emails, student IDs, or other personal
information. A random anonymous identifier is stored in your browser to
count usage in aggregate.
