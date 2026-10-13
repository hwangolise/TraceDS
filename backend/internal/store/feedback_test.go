//go:build integration

package store_test

// M8 — the pgx Store's InsertFeedback against real PostgreSQL
// (ARCHITECTURE §9.3 `feedback` table). Rows are read back with handwritten SQL.

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"traceds/backend/internal/store"
)

type feedbackRow struct {
	ID, SessionID string
	Helpfulness   int
	Topic, Text   sql.NullString
}

func readFeedback(t *testing.T, db testDB) []feedbackRow {
	t.Helper()
	rows, err := db.Pool.Query(context.Background(),
		`select id::text, session_id::text, helpfulness, requested_topic, comments from feedback order by created_at, id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []feedbackRow
	for rows.Next() {
		var r feedbackRow
		if err := rows.Scan(&r.ID, &r.SessionID, &r.Helpfulness, &r.Topic, &r.Text); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func countRows(t *testing.T, db testDB, table string) int {
	t.Helper()
	var n int
	if err := db.Pool.QueryRow(context.Background(), `select count(*) from `+table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestM8InsertFeedbackPersistsEveryField(t *testing.T) {
	db := migratedDB(t)
	pg := store.NewPostgres(db.Pool)
	sid := newUUID(t)
	if err := pg.InsertFeedback(context.Background(), store.Feedback{
		SessionID: sid, Helpfulness: 5, RequestedTopic: strp("arrays-vs-linked-lists"), Comments: strp("Add more on 'null' cases; \"quotes\" ok"),
	}); err != nil {
		t.Fatal(err)
	}
	rows := readFeedback(t, db)
	if len(rows) != 1 {
		t.Fatalf("rows = %+v", rows)
	}
	r := rows[0]
	if r.SessionID != sid || r.Helpfulness != 5 || r.Topic.String != "arrays-vs-linked-lists" || r.Text.String != `Add more on 'null' cases; "quotes" ok` {
		t.Fatalf("row = %+v", r)
	}
	if r.ID == "" {
		t.Fatal("id was not generated")
	}
}

func TestM8InsertFeedbackMinimalStoresNulls(t *testing.T) {
	db := migratedDB(t)
	pg := store.NewPostgres(db.Pool)
	if err := pg.InsertFeedback(context.Background(), store.Feedback{SessionID: newUUID(t), Helpfulness: 1}); err != nil {
		t.Fatal(err)
	}
	r := readFeedback(t, db)[0]
	if r.Topic.Valid || r.Text.Valid {
		t.Fatalf("optional columns should be NULL: %+v", r)
	}
}

func TestM8InsertFeedbackCreatesMissingSessionAndKeepsExisting(t *testing.T) {
	db := migratedDB(t)
	pg := store.NewPostgres(db.Pool)
	ctx := context.Background()

	fresh := newUUID(t)
	if err := pg.InsertFeedback(ctx, store.Feedback{SessionID: fresh, Helpfulness: 3}); err != nil {
		t.Fatal(err)
	}
	known := newUUID(t)
	if _, err := pg.CreateSession(ctx, store.Session{ID: known, AppVersion: strp("v1"), Viewport: strp("narrow")}); err != nil {
		t.Fatal(err)
	}
	if err := pg.InsertFeedback(ctx, store.Feedback{SessionID: known, Helpfulness: 4}); err != nil {
		t.Fatal(err)
	}
	got := map[string]sessionRow{}
	for _, s := range readSessions(t, db) {
		got[s.ID] = s
	}
	if len(got) != 2 {
		t.Fatalf("sessions = %+v, want exactly two", got)
	}
	if k := got[known]; k.AppVersion.String != "v1" || k.Viewport.String != "narrow" {
		t.Fatalf("existing session metadata changed: %+v", k)
	}
	if f := got[fresh]; f.AppVersion.Valid || f.Viewport.Valid {
		t.Fatalf("feedback-created session has metadata: %+v", f)
	}
}

func TestM8InsertFeedbackAcceptsMultipleRowsPerSession(t *testing.T) {
	db := migratedDB(t)
	pg := store.NewPostgres(db.Pool)
	sid := newUUID(t)
	for _, n := range []int{2, 5} {
		if err := pg.InsertFeedback(context.Background(), store.Feedback{SessionID: sid, Helpfulness: n}); err != nil {
			t.Fatal(err)
		}
	}
	if got := len(readFeedback(t, db)); got != 2 {
		t.Fatalf("rows = %d, want 2 (a student may submit after another completion)", got)
	}
}

func TestM8DatabaseConstraintsBackstopTheAPI(t *testing.T) {
	db := migratedDB(t)
	pg := store.NewPostgres(db.Pool)
	ctx := context.Background()
	long := strings.Repeat("x", 2001)
	for name, f := range map[string]store.Feedback{
		"helpfulness 0":     {SessionID: newUUID(t), Helpfulness: 0},
		"helpfulness 6":     {SessionID: newUUID(t), Helpfulness: 6},
		"comments too long": {SessionID: newUUID(t), Helpfulness: 3, Comments: &long},
	} {
		if err := pg.InsertFeedback(ctx, f); err == nil {
			t.Fatalf("%s: want a constraint error", name)
		} else if sqlState(err) != "23514" {
			t.Fatalf("%s: SQLSTATE = %q, want 23514 (check_violation); err: %v", name, sqlState(err), err)
		}
	}
	// The failed inserts were rolled back with their session upserts.
	if n := countRows(t, db, "sessions"); n != 0 {
		t.Fatalf("sessions = %d after rejected feedback, want 0 (transaction rollback)", n)
	}
	if n := countRows(t, db, "feedback"); n != 0 {
		t.Fatalf("feedback = %d, want 0", n)
	}
}

func TestM8CommentsAt2000MultibyteCharactersAccepted(t *testing.T) {
	db := migratedDB(t)
	pg := store.NewPostgres(db.Pool)
	text := strings.Repeat("🙂", 2000)
	if err := pg.InsertFeedback(context.Background(), store.Feedback{SessionID: newUUID(t), Helpfulness: 3, Comments: &text}); err != nil {
		t.Fatal(err)
	}
	if got := readFeedback(t, db)[0].Text.String; got != text {
		t.Fatal("2000 four-byte characters did not round-trip")
	}
}

func TestM8FeedbackTableHoldsOnlyApprovedColumns(t *testing.T) {
	db := migratedDB(t)
	rows, err := db.Pool.Query(context.Background(),
		`select column_name from information_schema.columns where table_schema = $1 and table_name = 'feedback' order by column_name`, db.Schema)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			t.Fatal(err)
		}
		cols = append(cols, c)
	}
	if got, want := strings.Join(cols, ","), "comments,created_at,helpfulness,id,requested_topic,session_id"; got != want {
		t.Fatalf("feedback columns = %s, want %s (no PII columns)", got, want)
	}
}
