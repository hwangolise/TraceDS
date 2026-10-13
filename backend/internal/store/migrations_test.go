//go:build integration

package store_test

// M-1..M-6 — migrations/0001_init.sql (ARCHITECTURE §9.3). The expected schema
// below is restated by hand from the spec DDL and checked through the system
// catalogs, independently of the migration text.

import (
	"context"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
)

var specTables = []string{"events", "feedback", "sessions"}

// specColumns: table → column → information_schema data_type.
var specColumns = map[string]map[string]string{
	"sessions": {
		"id": "uuid", "created_at": "timestamp with time zone", "app_version": "text", "viewport": "text",
	},
	"events": {
		"id": "uuid", "seq": "bigint", "session_id": "uuid", "run_id": "uuid", "event_type": "text",
		"module_id": "text", "exercise_id": "text", "step_id": "text", "choice_id": "text",
		"correct": "boolean", "attempt_number": "integer", "concept_id": "text",
		"misconception_id": "text", "client_ts": "timestamp with time zone",
		"created_at": "timestamp with time zone",
	},
	"feedback": {
		"id": "uuid", "session_id": "uuid", "helpfulness": "smallint", "requested_topic": "text",
		"comments": "text", "created_at": "timestamp with time zone",
	},
}

var specNotNull = map[string][]string{
	"sessions": {"created_at", "id"},
	"events":   {"client_ts", "created_at", "event_type", "id", "seq", "session_id"},
	"feedback": {"created_at", "helpfulness", "id", "session_id"},
}

func queryStrings(t *testing.T, db testDB, sql string, args ...any) []string {
	t.Helper()
	rows, err := db.Pool.Query(context.Background(), sql, args...)
	if err != nil {
		t.Fatalf("query %q: %v", sql, err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			t.Fatal(err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	sort.Strings(out)
	return out
}

// M-1: applies cleanly to an empty database; RLS enabled with no policies.

func TestM1MigrationAppliesToEmptyDatabase(t *testing.T) {
	db := emptyDB(t)
	if err := applySQL(context.Background(), db.Pool, migrationSQL(t)); err != nil {
		t.Fatalf("0001_init.sql failed on an empty database: %v", err)
	}
	got := queryStrings(t, db, `select table_name from information_schema.tables
		where table_schema = $1 and table_type = 'BASE TABLE'`, db.Schema)
	if !reflect.DeepEqual(got, specTables) {
		t.Fatalf("tables = %v, want exactly %v", got, specTables)
	}
}

func TestM1RowLevelSecurityEnabledWithNoPolicies(t *testing.T) {
	db := migratedDB(t)
	got := queryStrings(t, db, `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = $1 and c.relkind = 'r' and c.relrowsecurity`, db.Schema)
	if !reflect.DeepEqual(got, specTables) {
		t.Fatalf("tables with RLS enabled = %v, want %v", got, specTables)
	}
	policies := queryStrings(t, db, `select policyname::text from pg_policies where schemaname = $1`, db.Schema)
	if len(policies) != 0 {
		t.Fatalf("policies = %v, want none (anon/authenticated keys must not read or write)", policies)
	}
}

// M-2: exact columns and types; no PII columns.

func TestM2ColumnsMatchSpecExactly(t *testing.T) {
	db := migratedDB(t)
	for table, want := range specColumns {
		t.Run(table, func(t *testing.T) {
			rows, err := db.Pool.Query(context.Background(), `select column_name, data_type
				from information_schema.columns where table_schema = $1 and table_name = $2`, db.Schema, table)
			if err != nil {
				t.Fatal(err)
			}
			defer rows.Close()
			got := map[string]string{}
			for rows.Next() {
				var name, typ string
				if err := rows.Scan(&name, &typ); err != nil {
					t.Fatal(err)
				}
				got[name] = typ
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("%s columns = %v\nwant exactly %v", table, got, want)
			}
		})
	}
}

func TestM2NoPIIColumns(t *testing.T) {
	db := migratedDB(t)
	pii := regexp.MustCompile(`(?i)(^|_)(name|first_name|last_name|full_name|email|e_mail|student|student_id|ip|ip_address|remote_addr|user_agent|ua|phone|device_id|fingerprint)(_|$)`)
	cols := queryStrings(t, db, `select table_name || '.' || column_name from information_schema.columns where table_schema = $1`, db.Schema)
	if len(cols) == 0 {
		t.Fatal("no columns found; the schema was not created")
	}
	for _, c := range cols {
		if pii.MatchString(strings.SplitN(c, ".", 2)[1]) {
			t.Errorf("column %s looks like PII", c)
		}
	}
}

// M-3: primary and foreign keys.

func TestM3PrimaryKeys(t *testing.T) {
	db := migratedDB(t)
	got := queryStrings(t, db, `select tc.table_name || '(' || string_agg(kcu.column_name, ',' order by kcu.ordinal_position) || ')'
		from information_schema.table_constraints tc
		join information_schema.key_column_usage kcu
		  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
		where tc.table_schema = $1 and tc.constraint_type = 'PRIMARY KEY'
		group by tc.table_name`, db.Schema)
	want := []string{"events(id)", "feedback(id)", "sessions(id)"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("primary keys = %v, want %v", got, want)
	}
}

func TestM3ForeignKeys(t *testing.T) {
	db := migratedDB(t)
	got := queryStrings(t, db, `select src.relname || '.' || sa.attname || ' -> ' || dst.relname || '.' || da.attname
		from pg_constraint con
		join pg_class src on src.oid = con.conrelid
		join pg_class dst on dst.oid = con.confrelid
		join pg_namespace n on n.oid = src.relnamespace
		join pg_attribute sa on sa.attrelid = con.conrelid and sa.attnum = any(con.conkey)
		join pg_attribute da on da.attrelid = con.confrelid and da.attnum = any(con.confkey)
		where n.nspname = $1 and con.contype = 'f'`, db.Schema)
	want := []string{"events.session_id -> sessions.id", "feedback.session_id -> sessions.id"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("foreign keys = %v, want %v", got, want)
	}
}

// M-4: NOT NULL columns and defaults.

func TestM4NotNullColumns(t *testing.T) {
	db := migratedDB(t)
	for table, want := range specNotNull {
		t.Run(table, func(t *testing.T) {
			got := queryStrings(t, db, `select column_name from information_schema.columns
				where table_schema = $1 and table_name = $2 and is_nullable = 'NO'`, db.Schema, table)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("%s NOT NULL columns = %v, want exactly %v", table, got, want)
			}
		})
	}
}

func TestM4Defaults(t *testing.T) {
	db := migratedDB(t)
	ctx := context.Background()
	session := newUUID(t)
	db.exec(t, `insert into sessions (id) values ($1)`, session)
	db.exec(t, `insert into events (client_ts, id, session_id, event_type) values ('2026-10-12T21:30:00Z', $1, $2, 'session_started')`, newUUID(t), session)
	db.exec(t, `insert into feedback (session_id, helpfulness) values ($1, 4)`, session)

	for _, table := range specTables {
		var recent bool
		if err := db.Pool.QueryRow(ctx, `select bool_and(created_at > now() - interval '1 minute') from `+table).Scan(&recent); err != nil {
			t.Fatalf("%s: %v", table, err)
		}
		if !recent {
			t.Errorf("%s.created_at does not default to now()", table)
		}
	}
	var feedbackID string
	if err := db.Pool.QueryRow(ctx, `select id::text from feedback`).Scan(&feedbackID); err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).MatchString(feedbackID) {
		t.Fatalf("feedback.id default = %q, want a generated UUID", feedbackID)
	}
}

func TestM4SeqFollowsInsertOrder(t *testing.T) {
	// events.seq is assigned by the database in insert order (EVENT ORDER, M7A review).
	db := migratedDB(t)
	session := newUUID(t)
	db.exec(t, `insert into sessions (id) values ($1)`, session)
	ids := []string{newUUID(t), newUUID(t), newUUID(t), newUUID(t)}
	for _, id := range ids {
		db.exec(t, `insert into events (client_ts, id, session_id, event_type) values ('2026-10-12T21:30:00Z', $1, $2, 'session_started')`, id, session)
	}
	got := []string{}
	rows, err := db.Pool.Query(context.Background(), `select id::text from events order by seq`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		got = append(got, id)
	}
	if !reflect.DeepEqual(got, ids) {
		t.Fatalf("order by seq = %v, want insert order %v", got, ids)
	}
}

// M-5: analytics indexes named in ARCHITECTURE §9.3.

func TestM5AnalyticsIndexes(t *testing.T) {
	db := migratedDB(t)
	rows, err := db.Pool.Query(context.Background(), `select indexname::text, indexdef from pg_indexes
		where schemaname = $1 and tablename = 'events'`, db.Schema)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	defs := map[string]string{}
	for rows.Next() {
		var name, def string
		if err := rows.Scan(&name, &def); err != nil {
			t.Fatal(err)
		}
		defs[name] = def
	}
	want := map[string][]string{
		"events_type_exercise_idx": {"(event_type, exercise_id)"},
		"events_session_idx":       {"(session_id)"},
		"events_step_idx":          {"(step_id)", "WHERE (event_type = 'answer_submitted'::text)"},
	}
	for name, parts := range want {
		def, ok := defs[name]
		if !ok {
			t.Errorf("index %s is missing (have %v)", name, defs)
			continue
		}
		for _, p := range parts {
			if !strings.Contains(def, p) {
				t.Errorf("index %s = %q, want it to contain %q", name, def, p)
			}
		}
	}
}

// M-6: invalid relational state is rejected by the database itself.

func TestM6InvalidStateRejected(t *testing.T) {
	const (
		fkViolation      = "23503"
		checkViolation   = "23514"
		notNullViolation = "23502"
		uniqueViolation  = "23505"
	)
	type tc struct {
		name, sql string
		args      func(session string) []any
		want      string // "" means the statement must succeed
	}
	none := func(string) []any { return nil }
	cases := []tc{
		{"event for a session that does not exist", `insert into events (client_ts, id, session_id, event_type) values ('2026-10-12T21:30:00Z', $1, $2, 'session_started')`,
			func(string) []any { return []any{newUUID(t), newUUID(t)} }, fkViolation},
		{"feedback for a session that does not exist", `insert into feedback (session_id, helpfulness) values ($1, 3)`,
			func(string) []any { return []any{newUUID(t)} }, fkViolation},
		{"unknown event_type", `insert into events (client_ts, id, session_id, event_type) values ('2026-10-12T21:30:00Z', $1, $2, 'page_view')`,
			func(s string) []any { return []any{newUUID(t), s} }, checkViolation},
		{"attempt_number 0", `insert into events (client_ts, id, session_id, event_type, attempt_number) values ('2026-10-12T21:30:00Z', $1, $2, 'answer_submitted', 0)`,
			func(s string) []any { return []any{newUUID(t), s} }, checkViolation},
		{"attempt_number 11", `insert into events (client_ts, id, session_id, event_type, attempt_number) values ('2026-10-12T21:30:00Z', $1, $2, 'answer_submitted', 11)`,
			func(s string) []any { return []any{newUUID(t), s} }, checkViolation},
		{"attempt_number 1", `insert into events (client_ts, id, session_id, event_type, attempt_number) values ('2026-10-12T21:30:00Z', $1, $2, 'answer_submitted', 1)`,
			func(s string) []any { return []any{newUUID(t), s} }, ""},
		{"attempt_number 10", `insert into events (client_ts, id, session_id, event_type, attempt_number) values ('2026-10-12T21:30:00Z', $1, $2, 'answer_submitted', 10)`,
			func(s string) []any { return []any{newUUID(t), s} }, ""},
		{"event without session_id", `insert into events (client_ts, id, event_type) values ('2026-10-12T21:30:00Z', $1, 'session_started')`,
			func(string) []any { return []any{newUUID(t)} }, notNullViolation},
		{"event without client_ts", `insert into events (id, session_id, event_type) values ($1, $2, 'session_started')`,
			func(s string) []any { return []any{newUUID(t), s} }, notNullViolation},
		{"event without event_type", `insert into events (client_ts, id, session_id) values ('2026-10-12T21:30:00Z', $1, $2)`,
			func(s string) []any { return []any{newUUID(t), s} }, notNullViolation},
		{"unknown viewport", `insert into sessions (id, viewport) values ($1, 'tablet')`,
			func(string) []any { return []any{newUUID(t)} }, checkViolation},
		{"viewport narrow", `insert into sessions (id, viewport) values ($1, 'narrow')`,
			func(string) []any { return []any{newUUID(t)} }, ""},
		{"viewport wide", `insert into sessions (id, viewport) values ($1, 'wide')`,
			func(string) []any { return []any{newUUID(t)} }, ""},
		{"helpfulness 0", `insert into feedback (session_id, helpfulness) values ($1, 0)`,
			func(s string) []any { return []any{s} }, checkViolation},
		{"helpfulness 6", `insert into feedback (session_id, helpfulness) values ($1, 6)`,
			func(s string) []any { return []any{s} }, checkViolation},
		{"helpfulness missing", `insert into feedback (session_id) values ($1)`,
			func(s string) []any { return []any{s} }, notNullViolation},
		{"comments of 2001 characters", `insert into feedback (session_id, helpfulness, comments) values ($1, 3, repeat('x', 2001))`,
			func(s string) []any { return []any{s} }, checkViolation},
		{"comments of 2000 characters", `insert into feedback (session_id, helpfulness, comments) values ($1, 3, repeat('x', 2000))`,
			func(s string) []any { return []any{s} }, ""},
		{"session without id", `insert into sessions (app_version) values ('v1')`, none, notNullViolation},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			db := migratedDB(t)
			session := newUUID(t)
			db.exec(t, `insert into sessions (id) values ($1)`, session)
			_, err := db.Pool.Exec(context.Background(), c.sql, c.args(session)...)
			if c.want == "" {
				if err != nil {
					t.Fatalf("valid statement failed: %v", err)
				}
				return
			}
			if got := sqlState(err); got != c.want {
				t.Fatalf("SQLSTATE = %q (err %v), want %s", got, err, c.want)
			}
		})
	}
}

func TestM6DuplicateEventIDRejected(t *testing.T) {
	db := migratedDB(t)
	session, id := newUUID(t), newUUID(t)
	db.exec(t, `insert into sessions (id) values ($1)`, session)
	db.exec(t, `insert into events (client_ts, id, session_id, event_type) values ('2026-10-12T21:30:00Z', $1, $2, 'session_started')`, id, session)
	_, err := db.Pool.Exec(context.Background(), `insert into events (client_ts, id, session_id, event_type) values ('2026-10-12T21:30:00Z', $1, $2, 'session_started')`, id, session)
	if got := sqlState(err); got != "23505" {
		t.Fatalf("SQLSTATE = %q (err %v), want 23505 unique_violation", got, err)
	}
}

func TestM6EveryEventTypeAccepted(t *testing.T) {
	db := migratedDB(t)
	session := newUUID(t)
	db.exec(t, `insert into sessions (id) values ($1)`, session)
	for _, typ := range []string{"session_started", "module_selected", "exercise_started", "answer_submitted",
		"hint_shown", "exercise_completed", "survey_submitted"} {
		if _, err := db.Pool.Exec(context.Background(), `insert into events (client_ts, id, session_id, event_type) values ('2026-10-12T21:30:00Z', $1, $2, $3)`,
			newUUID(t), session, typ); err != nil {
			t.Errorf("event_type %q rejected: %v", typ, err)
		}
	}
}
