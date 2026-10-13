//go:build integration

package store_test

// PG1–PG7 — the pgx Store against real PostgreSQL (ARCHITECTURE §9.1–9.3).
// Rows are read back with handwritten SQL, not through the store.

import (
	"context"
	"database/sql"
	"reflect"
	"testing"
	"time"

	"traceds/backend/internal/store"
)

// sampleClientTS is a valid client timestamp (client_ts is NOT NULL, ANALYTICS §3).
const sampleClientTS = "2026-10-12T21:30:00.000Z"

func strp(s string) *string { return &s }
func boolp(b bool) *bool    { return &b }
func intp(i int) *int       { return &i }

func tsp(t *testing.T, s string) *time.Time {
	t.Helper()
	ts, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatal(err)
	}
	return &ts
}

type sessionRow struct {
	ID         string
	AppVersion sql.NullString
	Viewport   sql.NullString
}

func readSessions(t *testing.T, db testDB) []sessionRow {
	t.Helper()
	rows, err := db.Pool.Query(context.Background(), `select id::text, app_version, viewport from sessions order by id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []sessionRow
	for rows.Next() {
		var r sessionRow
		if err := rows.Scan(&r.ID, &r.AppVersion, &r.Viewport); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

type eventRow struct {
	ID, SessionID, EventType                                       string
	RunID, ModuleID, ExerciseID, StepID, ChoiceID, Concept, Miscon sql.NullString
	Correct                                                        sql.NullBool
	Attempt                                                        sql.NullInt32
	ClientTS                                                       sql.NullTime
}

func readEvents(t *testing.T, db testDB) map[string]eventRow {
	t.Helper()
	rows, err := db.Pool.Query(context.Background(), `select id::text, session_id::text, event_type, run_id::text,
		module_id, exercise_id, step_id, choice_id, concept_id, misconception_id, correct, attempt_number, client_ts
		from events`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]eventRow{}
	for rows.Next() {
		var r eventRow
		if err := rows.Scan(&r.ID, &r.SessionID, &r.EventType, &r.RunID, &r.ModuleID, &r.ExerciseID, &r.StepID,
			&r.ChoiceID, &r.Concept, &r.Miscon, &r.Correct, &r.Attempt, &r.ClientTS); err != nil {
			t.Fatal(err)
		}
		out[r.ID] = r
	}
	return out
}

func ns(s string) sql.NullString { return sql.NullString{String: s, Valid: true} }

func TestPG1Ping(t *testing.T) {
	db := migratedDB(t)
	if err := store.NewPostgres(db.Pool).Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

func TestPG2CreateSessionUpsert(t *testing.T) {
	db := migratedDB(t)
	st := store.NewPostgres(db.Pool)
	ctx := context.Background()
	id := newUUID(t)

	created, err := st.CreateSession(ctx, store.Session{ID: id, AppVersion: strp("2026.10.12-abc123"), Viewport: strp("narrow")})
	if err != nil || !created {
		t.Fatalf("first CreateSession = (%v, %v), want (true, nil)", created, err)
	}
	created, err = st.CreateSession(ctx, store.Session{ID: id, AppVersion: strp("other"), Viewport: strp("wide")})
	if err != nil || created {
		t.Fatalf("repeat CreateSession = (%v, %v), want (false, nil)", created, err)
	}
	want := []sessionRow{{ID: id, AppVersion: ns("2026.10.12-abc123"), Viewport: ns("narrow")}}
	if got := readSessions(t, db); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v (first write kept)", got, want)
	}
}

func TestPG3CreateSessionOptionalFieldsNull(t *testing.T) {
	db := migratedDB(t)
	id := newUUID(t)
	if _, err := store.NewPostgres(db.Pool).CreateSession(context.Background(), store.Session{ID: id}); err != nil {
		t.Fatal(err)
	}
	want := []sessionRow{{ID: id}}
	if got := readSessions(t, db); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
}

func TestPG4InsertEventsPreservesEveryField(t *testing.T) {
	db := migratedDB(t)
	session, run := newUUID(t), newUUID(t)
	wrong, hint, completed := newUUID(t), newUUID(t), newUUID(t)
	events := []store.Event{
		{ID: wrong, SessionID: session, RunID: strp(run), EventType: "answer_submitted",
			ModuleID: strp("linked-lists"), ExerciseID: strp("LL-04"), StepID: strp("ll04-c3"), ChoiceID: strp("a"),
			Correct: boolp(false), AttemptNumber: intp(1), ConceptID: strp("deep-copy"),
			MisconceptionID: strp("shallow-head"), ClientTS: tsp(t, "2026-10-12T21:30:00.123Z")},
		{ID: hint, SessionID: session, RunID: strp(run), EventType: "hint_shown",
			ModuleID: strp("linked-lists"), ExerciseID: strp("LL-04"), StepID: strp("ll04-c3"), ChoiceID: strp("a"),
			AttemptNumber: intp(1), ConceptID: strp("deep-copy"), MisconceptionID: strp("shallow-head"),
			ClientTS: tsp(t, "2026-10-12T21:30:00.124Z")},
		{ID: completed, SessionID: session, RunID: strp(run), EventType: "exercise_completed",
			ModuleID: strp("linked-lists"), ExerciseID: strp("LL-04"), ClientTS: tsp(t, "2026-10-12T21:35:10.000Z")},
	}
	if _, err := store.NewPostgres(db.Pool).InsertEvents(context.Background(), session, events); err != nil {
		t.Fatalf("InsertEvents: %v", err)
	}

	got := readEvents(t, db)
	want := map[string]eventRow{
		wrong: {ID: wrong, SessionID: session, EventType: "answer_submitted", RunID: ns(run),
			ModuleID: ns("linked-lists"), ExerciseID: ns("LL-04"), StepID: ns("ll04-c3"), ChoiceID: ns("a"),
			Concept: ns("deep-copy"), Miscon: ns("shallow-head"), Correct: sql.NullBool{Bool: false, Valid: true},
			Attempt: sql.NullInt32{Int32: 1, Valid: true}},
		hint: {ID: hint, SessionID: session, EventType: "hint_shown", RunID: ns(run),
			ModuleID: ns("linked-lists"), ExerciseID: ns("LL-04"), StepID: ns("ll04-c3"), ChoiceID: ns("a"),
			Concept: ns("deep-copy"), Miscon: ns("shallow-head"), Attempt: sql.NullInt32{Int32: 1, Valid: true}},
		completed: {ID: completed, SessionID: session, EventType: "exercise_completed", RunID: ns(run),
			ModuleID: ns("linked-lists"), ExerciseID: ns("LL-04")},
	}
	wantTS := map[string]string{wrong: "2026-10-12T21:30:00.123Z", hint: "2026-10-12T21:30:00.124Z", completed: "2026-10-12T21:35:10.000Z"}
	if len(got) != len(want) {
		t.Fatalf("stored %d events, want %d", len(got), len(want))
	}
	for id, w := range want {
		g, ok := got[id]
		if !ok {
			t.Fatalf("event %s missing", id)
		}
		if !g.ClientTS.Valid || !g.ClientTS.Time.Equal(*tsp(t, wantTS[id])) {
			t.Errorf("event %s client_ts = %v, want %s", id, g.ClientTS, wantTS[id])
		}
		g.ClientTS = sql.NullTime{}
		if !reflect.DeepEqual(g, w) {
			t.Errorf("event %s\n got %+v\nwant %+v", id, g, w)
		}
	}
}

func TestPG5InsertEventsUpsertsSession(t *testing.T) {
	db := migratedDB(t)
	session := newUUID(t)
	_, err := store.NewPostgres(db.Pool).InsertEvents(context.Background(), session,
		[]store.Event{{ID: newUUID(t), SessionID: session, EventType: "session_started", ClientTS: tsp(t, sampleClientTS)}})
	if err != nil {
		t.Fatalf("InsertEvents for an unknown session: %v", err)
	}
	want := []sessionRow{{ID: session}}
	if got := readSessions(t, db); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
}

func TestPG5InsertEventsKeepsExistingSession(t *testing.T) {
	db := migratedDB(t)
	session := newUUID(t)
	db.exec(t, `insert into sessions (id, app_version, viewport) values ($1, 'v1', 'wide')`, session)
	_, err := store.NewPostgres(db.Pool).InsertEvents(context.Background(), session,
		[]store.Event{{ID: newUUID(t), SessionID: session, EventType: "session_started", ClientTS: tsp(t, sampleClientTS)}})
	if err != nil {
		t.Fatal(err)
	}
	want := []sessionRow{{ID: session, AppVersion: ns("v1"), Viewport: ns("wide")}}
	if got := readSessions(t, db); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
}

func TestPG6InsertEventsIdempotent(t *testing.T) {
	db := migratedDB(t)
	st := store.NewPostgres(db.Pool)
	ctx := context.Background()
	session := newUUID(t)
	a := store.Event{ID: newUUID(t), SessionID: session, EventType: "exercise_completed", RunID: strp(newUUID(t)),
		ModuleID: strp("linked-lists"), ExerciseID: strp("LL-01"), ClientTS: tsp(t, sampleClientTS)}
	b := store.Event{ID: newUUID(t), SessionID: session, EventType: "module_selected", ModuleID: strp("linked-lists"), ClientTS: tsp(t, sampleClientTS)}

	for _, step := range []struct {
		name   string
		events []store.Event
		want   int
	}{
		{"first delivery", []store.Event{a}, 1},
		{"identical retry", []store.Event{a}, 0},
		{"retry plus a new event", []store.Event{a, b}, 1},
	} {
		n, err := st.InsertEvents(ctx, session, step.events)
		if err != nil {
			t.Fatalf("%s: %v", step.name, err)
		}
		if n != step.want {
			t.Fatalf("%s: inserted = %d, want %d (new rows only)", step.name, n, step.want)
		}
	}
	var total, completions int
	if err := db.Pool.QueryRow(ctx, `select count(*), count(*) filter (where event_type = 'exercise_completed') from events`).Scan(&total, &completions); err != nil {
		t.Fatal(err)
	}
	if total != 2 || completions != 1 {
		t.Fatalf("rows = %d (completions %d), want 2 (completions 1)", total, completions)
	}
}

func TestPG7EventsBelongToGivenSession(t *testing.T) {
	db := migratedDB(t)
	st := store.NewPostgres(db.Pool)
	ctx := context.Background()
	s1, s2 := newUUID(t), newUUID(t)
	e1, e2 := newUUID(t), newUUID(t)
	if _, err := st.InsertEvents(ctx, s1, []store.Event{{ID: e1, SessionID: s1, EventType: "session_started", ClientTS: tsp(t, sampleClientTS)}}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.InsertEvents(ctx, s2, []store.Event{{ID: e2, SessionID: s2, EventType: "session_started", ClientTS: tsp(t, sampleClientTS)}}); err != nil {
		t.Fatal(err)
	}
	got := readEvents(t, db)
	if got[e1].SessionID != s1 || got[e2].SessionID != s2 {
		t.Fatalf("event sessions = {%s: %s, %s: %s}, want {%s: %s, %s: %s}", e1, got[e1].SessionID, e2, got[e2].SessionID, e1, s1, e2, s2)
	}
}

// PG2 — enrichment: null metadata is filled by a later CreateSession, known values are kept.
func TestPG2CreateSessionFillsOnlyMissingMetadata(t *testing.T) {
	db := migratedDB(t)
	st := store.NewPostgres(db.Pool)
	ctx := context.Background()
	id := newUUID(t)
	if _, err := st.CreateSession(ctx, store.Session{ID: id, Viewport: strp("narrow")}); err != nil {
		t.Fatal(err)
	}
	created, err := st.CreateSession(ctx, store.Session{ID: id, Viewport: strp("wide"), AppVersion: strp("v2")})
	if err != nil || created {
		t.Fatalf("CreateSession = (%v, %v), want (false, nil)", created, err)
	}
	want := []sessionRow{{ID: id, AppVersion: ns("v2"), Viewport: ns("narrow")}}
	if got := readSessions(t, db); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
}

func createdAt(t *testing.T, db testDB, id string) time.Time {
	t.Helper()
	var ts time.Time
	if err := db.Pool.QueryRow(context.Background(), `select created_at from sessions where id = $1`, id).Scan(&ts); err != nil {
		t.Fatal(err)
	}
	return ts
}

// PG5 — /events first, then /sessions: one row, enriched, created_at unchanged.
func TestPG5SessionAfterEventsEnrichesWithoutChangingCreatedAt(t *testing.T) {
	db := migratedDB(t)
	st := store.NewPostgres(db.Pool)
	ctx := context.Background()
	id := newUUID(t)
	if _, err := st.InsertEvents(ctx, id, []store.Event{{ID: newUUID(t), SessionID: id, EventType: "session_started", ClientTS: tsp(t, sampleClientTS)}}); err != nil {
		t.Fatal(err)
	}
	before := createdAt(t, db, id)
	db.exec(t, `select pg_sleep(0.05)`)
	created, err := st.CreateSession(ctx, store.Session{ID: id, AppVersion: strp("v7"), Viewport: strp("wide")})
	if err != nil || created {
		t.Fatalf("CreateSession after events = (%v, %v), want (false, nil)", created, err)
	}
	want := []sessionRow{{ID: id, AppVersion: ns("v7"), Viewport: ns("wide")}}
	if got := readSessions(t, db); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want exactly %+v", got, want)
	}
	if after := createdAt(t, db, id); !after.Equal(before) {
		t.Fatalf("created_at changed from %v to %v", before, after)
	}
}

// PG5 — both delivery orders converge to the same session row.
func TestPG5DeliveryOrdersConverge(t *testing.T) {
	ctx := context.Background()
	meta := func(id string) store.Session {
		return store.Session{ID: id, AppVersion: strp("2026.10.13-x"), Viewport: strp("narrow")}
	}
	event := func(id string) []store.Event {
		return []store.Event{{ID: newUUID(t), SessionID: id, EventType: "session_started", ClientTS: tsp(t, sampleClientTS)}}
	}

	a := migratedDB(t)
	idA := newUUID(t)
	if _, err := store.NewPostgres(a.Pool).CreateSession(ctx, meta(idA)); err != nil {
		t.Fatal(err)
	}
	if _, err := store.NewPostgres(a.Pool).InsertEvents(ctx, idA, event(idA)); err != nil {
		t.Fatal(err)
	}

	b := migratedDB(t)
	idB := newUUID(t)
	if _, err := store.NewPostgres(b.Pool).InsertEvents(ctx, idB, event(idB)); err != nil {
		t.Fatal(err)
	}
	if _, err := store.NewPostgres(b.Pool).CreateSession(ctx, meta(idB)); err != nil {
		t.Fatal(err)
	}

	ra, rb := readSessions(t, a), readSessions(t, b)
	if len(ra) != 1 || len(rb) != 1 {
		t.Fatalf("rows: sessions→events %d, events→sessions %d; want 1 each", len(ra), len(rb))
	}
	ra[0].ID, rb[0].ID = "", ""
	if !reflect.DeepEqual(ra[0], rb[0]) || ra[0].Viewport != ns("narrow") || ra[0].AppVersion != ns("2026.10.13-x") {
		t.Fatalf("sessions→events %+v and events→sessions %+v must both carry the metadata", ra[0], rb[0])
	}
}

// PG4 — stored order (order by seq) equals batch order, within and across batches.
func TestPG4StoredOrderMatchesBatchOrder(t *testing.T) {
	db := migratedDB(t)
	st := store.NewPostgres(db.Pool)
	ctx := context.Background()
	session, run := newUUID(t), newUUID(t)
	ts := tsp(t, "2026-10-12T21:30:00.000Z") // identical client_ts: order must not depend on it
	ev := func(typ string) store.Event {
		return store.Event{ID: newUUID(t), SessionID: session, RunID: strp(run), EventType: typ,
			ModuleID: strp("linked-lists"), ExerciseID: strp("LL-01"), ClientTS: ts}
	}
	first := []store.Event{ev("answer_submitted"), ev("hint_shown"), ev("answer_submitted"), ev("exercise_completed")}
	var second []store.Event
	for i := 0; i < 20; i++ {
		second = append(second, ev([]string{"exercise_started", "answer_submitted", "hint_shown"}[i%3]))
	}
	for _, b := range [][]store.Event{first, second} {
		if _, err := st.InsertEvents(ctx, session, b); err != nil {
			t.Fatalf("InsertEvents: %v", err)
		}
	}
	var want []string
	for _, e := range append(append([]store.Event{}, first...), second...) {
		want = append(want, e.ID)
	}
	rows, err := db.Pool.Query(ctx, `select id::text from events order by seq`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		got = append(got, id)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("order by seq does not match batch order\n got %v\nwant %v", got, want)
	}
}

// PG6 — event_id identity wins (final decision 5).
func TestPG6DuplicateIDWithinOneCallStoredOnce(t *testing.T) {
	db := migratedDB(t)
	session := newUUID(t)
	e := store.Event{ID: newUUID(t), SessionID: session, EventType: "exercise_completed", RunID: strp(newUUID(t)),
		ModuleID: strp("linked-lists"), ExerciseID: strp("LL-01"), ClientTS: tsp(t, sampleClientTS)}
	n, err := store.NewPostgres(db.Pool).InsertEvents(context.Background(), session, []store.Event{e, e})
	if err != nil {
		t.Fatalf("a duplicate id within one batch must not fail: %v", err)
	}
	if n != 1 {
		t.Fatalf("inserted = %d, want 1", n)
	}
	if got := readEvents(t, db); len(got) != 1 {
		t.Fatalf("stored %d rows, want 1", len(got))
	}
}

func TestPG6StoredIDUnderAnotherSessionKeepsOwnership(t *testing.T) {
	db := migratedDB(t)
	st := store.NewPostgres(db.Pool)
	ctx := context.Background()
	owner, other, id := newUUID(t), newUUID(t), newUUID(t)
	if _, err := st.InsertEvents(ctx, owner, []store.Event{{ID: id, SessionID: owner, EventType: "module_selected",
		ModuleID: strp("linked-lists"), ClientTS: tsp(t, sampleClientTS)}}); err != nil {
		t.Fatal(err)
	}
	n, err := st.InsertEvents(ctx, other, []store.Event{{ID: id, SessionID: other, EventType: "module_selected",
		ModuleID: strp("linked-lists"), ClientTS: tsp(t, sampleClientTS)}})
	if err != nil {
		t.Fatalf("resending a stored id under another session must not fail: %v", err)
	}
	if n != 0 {
		t.Fatalf("inserted = %d, want 0", n)
	}
	got := readEvents(t, db)
	if len(got) != 1 || got[id].SessionID != owner {
		t.Fatalf("rows = %+v, want one row owned by %s", got, owner)
	}
}
