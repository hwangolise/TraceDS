-- 0001_init.sql: schema for sessions, events, feedback (docs/ARCHITECTURE.md §9.3).
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0001_init.sql
-- No PII columns: sessions are random UUIDs; no names, emails, student ids,
-- IP addresses, or user agents are stored.

create table sessions (
  id           uuid primary key,
  created_at   timestamptz not null default now(),
  app_version  text,
  viewport     text check (viewport in ('narrow','wide'))
);

create table events (
  id               uuid primary key,                       -- client event_id (idempotency)
  seq              bigint generated always as identity,    -- server persistence order (tracked order within a batch)
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
  client_ts        timestamptz not null,                   -- required by the API (ANALYTICS §3)
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
