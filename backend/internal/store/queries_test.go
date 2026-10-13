//go:build integration

package store_test

// Q1–Q7 — the launch queries, copied verbatim from docs/ANALYTICS.md §6, run
// against a hand-built dataset seeded with plain SQL. Expected numbers are
// worked out by hand in the comments below.
//
// Dataset (module linked-lists unless noted):
//
//	s1: starts LL-01..LL-04 and completes all four; restarts LL-01 and completes it again.
//	s2: starts LL-01 and completes it; starts LL-02 and stops.
//	s3: starts LL-01 and stops.
//	s4: opens the module only (module_selected), never starts an exercise.
//	s5: starts LL-01, restarts it, completes it.
//
// First attempts (answer_submitted, attempt_number = 1):
//
//	ll01-c1: s1 wrong, s2 right, s3 wrong, s5 right  → 2 of 4 wrong (50.0%)
//	ll01-c3: s1 wrong, s2 wrong, s3 right, s5 wrong  → 3 of 4 wrong (75.0%)
//	ll02-c1: s1 right                                → 0 of 1 wrong (0.0%)
//
// Second attempts that Q4 must ignore: s1 ll01-c1 right, s3 ll01-c1 right,
// s2 ll01-c3 wrong, s2 ll01-c3 attempt 3 right. hint_shown rows also carry
// attempt_number = 1 and must not count as answers.
//
// Hints (one per wrong answer):
//
//	dynamic-allocation / ref-holds-value:         s1 c1, s3 c1          = 2
//	aliasing / assignment-copies-object:          s1 c3, s2 c3, s5 c3   = 3
//	aliasing / ref-to-variable:                   s2 c3 (attempt 2)     = 1

import (
	"context"
	"reflect"
	"testing"
)

type seed struct {
	db       testDB
	t        *testing.T
	sessions map[string]string
}

func newSeed(t *testing.T) *seed {
	s := &seed{db: migratedDB(t), t: t, sessions: map[string]string{}}
	for _, name := range []string{"s1", "s2", "s3", "s4", "s5"} {
		s.sessions[name] = newUUID(t)
		s.db.exec(t, `insert into sessions (id) values ($1)`, s.sessions[name])
	}
	return s
}

func (s *seed) moduleSelected(session string) {
	s.db.exec(s.t, `insert into events (client_ts, id, session_id, event_type, module_id) values ('2026-10-12T21:30:00Z', $1, $2, 'module_selected', 'linked-lists')`,
		newUUID(s.t), s.sessions[session])
}

// started inserts exercise_started and returns the run id.
func (s *seed) started(session, exercise string) string {
	run := newUUID(s.t)
	s.db.exec(s.t, `insert into events (client_ts, id, session_id, run_id, event_type, module_id, exercise_id)
		values ('2026-10-12T21:30:00Z', $1, $2, $3, 'exercise_started', 'linked-lists', $4)`, newUUID(s.t), s.sessions[session], run, exercise)
	return run
}

func (s *seed) completed(session, run, exercise string) {
	s.db.exec(s.t, `insert into events (client_ts, id, session_id, run_id, event_type, module_id, exercise_id)
		values ('2026-10-12T21:30:00Z', $1, $2, $3, 'exercise_completed', 'linked-lists', $4)`, newUUID(s.t), s.sessions[session], run, exercise)
}

func (s *seed) answer(session, run, exercise, step, concept string, attempt int, correct bool, misconception string) {
	var m any
	if misconception != "" {
		m = misconception
	}
	s.db.exec(s.t, `insert into events (client_ts, id, session_id, run_id, event_type, module_id, exercise_id, step_id, choice_id,
		correct, attempt_number, concept_id, misconception_id)
		values ('2026-10-12T21:30:00Z', $1, $2, $3, 'answer_submitted', 'linked-lists', $4, $5, 'a', $6, $7, $8, $9)`,
		newUUID(s.t), s.sessions[session], run, exercise, step, correct, attempt, concept, m)
	if !correct {
		s.db.exec(s.t, `insert into events (client_ts, id, session_id, run_id, event_type, module_id, exercise_id, step_id, choice_id,
			attempt_number, concept_id, misconception_id)
			values ('2026-10-12T21:30:00Z', $1, $2, $3, 'hint_shown', 'linked-lists', $4, $5, 'a', $6, $7, $8)`,
			newUUID(s.t), s.sessions[session], run, exercise, step, attempt, concept, misconception)
	}
}

func (s *seed) feedback(session string, topic any) {
	s.db.exec(s.t, `insert into feedback (session_id, helpfulness, requested_topic) values ($1, 4, $2)`, s.sessions[session], topic)
}

// launchDataset builds the dataset described at the top of this file.
func launchDataset(t *testing.T) testDB {
	s := newSeed(t)
	const ll1, ll2 = "LL-01", "LL-02"

	// s1
	s.moduleSelected("s1")
	r := s.started("s1", ll1)
	s.answer("s1", r, ll1, "ll01-c1", "dynamic-allocation", 1, false, "ref-holds-value")
	s.answer("s1", r, ll1, "ll01-c1", "dynamic-allocation", 2, true, "")
	s.answer("s1", r, ll1, "ll01-c3", "aliasing", 1, false, "assignment-copies-object")
	s.completed("s1", r, ll1)
	r = s.started("s1", ll2)
	s.answer("s1", r, ll2, "ll02-c1", "traversal", 1, true, "")
	s.completed("s1", r, ll2)
	r = s.started("s1", "LL-03")
	s.completed("s1", r, "LL-03")
	r = s.started("s1", "LL-04")
	s.completed("s1", r, "LL-04")
	r = s.started("s1", ll1) // restart LL-01, second completion
	s.completed("s1", r, ll1)

	// s2
	s.moduleSelected("s2")
	r = s.started("s2", ll1)
	s.answer("s2", r, ll1, "ll01-c1", "dynamic-allocation", 1, true, "")
	s.answer("s2", r, ll1, "ll01-c3", "aliasing", 1, false, "assignment-copies-object")
	s.answer("s2", r, ll1, "ll01-c3", "aliasing", 2, false, "ref-to-variable")
	s.answer("s2", r, ll1, "ll01-c3", "aliasing", 3, true, "")
	s.completed("s2", r, ll1)
	s.started("s2", ll2)

	// s3
	r = s.started("s3", ll1)
	s.answer("s3", r, ll1, "ll01-c1", "dynamic-allocation", 1, false, "ref-holds-value")
	s.answer("s3", r, ll1, "ll01-c1", "dynamic-allocation", 2, true, "")
	s.answer("s3", r, ll1, "ll01-c3", "aliasing", 1, true, "")

	// s4
	s.moduleSelected("s4")

	// s5
	s.started("s5", ll1) // abandoned run
	r = s.started("s5", ll1)
	s.answer("s5", r, ll1, "ll01-c1", "dynamic-allocation", 1, true, "")
	s.answer("s5", r, ll1, "ll01-c3", "aliasing", 1, false, "assignment-copies-object")
	s.completed("s5", r, ll1)

	// Feedback (Q7): doubly-linked-lists ×3, recursion ×2, big-o ×1, no topic ×2.
	for _, f := range []struct {
		session string
		topic   any
	}{{"s1", "doubly-linked-lists"}, {"s2", "doubly-linked-lists"}, {"s5", "doubly-linked-lists"},
		{"s1", "recursion"}, {"s3", "recursion"}, {"s2", "big-o"}, {"s4", nil}, {"s5", nil}} {
		s.feedback(f.session, f.topic)
	}
	return s.db
}

func scalarInt(t *testing.T, db testDB, sql string) int {
	t.Helper()
	var n int
	if err := db.Pool.QueryRow(context.Background(), sql).Scan(&n); err != nil {
		t.Fatalf("%v\n%s", err, sql)
	}
	return n
}

func TestQ1StudentsWhoStarted(t *testing.T) {
	db := launchDataset(t)
	got := scalarInt(t, db, `select count(distinct session_id) from events where event_type = 'exercise_started';`)
	if got != 4 { // s1, s2, s3, s5 (s4 never started)
		t.Fatalf("Q1 = %d, want 4", got)
	}
	if visitors := scalarInt(t, db, `select count(*) from sessions`); visitors != 5 {
		t.Fatalf("visitors = %d, want 5", visitors)
	}
}

func TestQ2StudentsWhoCompleted(t *testing.T) {
	db := launchDataset(t)
	got := scalarInt(t, db, `select count(distinct session_id) from events where event_type = 'exercise_completed';`)
	if got != 3 { // s1, s2, s5
		t.Fatalf("Q2 = %d, want 3", got)
	}
}

func TestQ3CompletionsPerExercise(t *testing.T) {
	db := launchDataset(t)
	rows, err := db.Pool.Query(context.Background(), `select exercise_id, count(distinct session_id) as students, count(*) as completions
from events where event_type = 'exercise_completed'
group by exercise_id order by exercise_id;`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type row struct {
		Exercise              string
		Students, Completions int
	}
	var got []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.Exercise, &r.Students, &r.Completions); err != nil {
			t.Fatal(err)
		}
		got = append(got, r)
	}
	want := []row{{"LL-01", 3, 4}, {"LL-02", 1, 1}, {"LL-03", 1, 1}, {"LL-04", 1, 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Q3 = %+v, want %+v", got, want)
	}
}

func TestQ4IncorrectFirstAttemptsPerStep(t *testing.T) {
	db := launchDataset(t)
	rows, err := db.Pool.Query(context.Background(), `select exercise_id, step_id,
       count(*) filter (where not correct)                    as wrong_first,
       count(*)                                               as first_attempts,
       round(100.0 * count(*) filter (where not correct) / count(*), 1) as pct_wrong
from events
where event_type = 'answer_submitted' and attempt_number = 1
group by exercise_id, step_id
order by pct_wrong desc, wrong_first desc;`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type row struct {
		Exercise, Step       string
		Wrong, FirstAttempts int
		Pct                  float64
	}
	var got []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.Exercise, &r.Step, &r.Wrong, &r.FirstAttempts, &r.Pct); err != nil {
			t.Fatal(err)
		}
		got = append(got, r)
	}
	want := []row{
		{"LL-01", "ll01-c3", 3, 4, 75.0},
		{"LL-01", "ll01-c1", 2, 4, 50.0},
		{"LL-02", "ll02-c1", 0, 1, 0.0},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Q4 = %+v\nwant %+v", got, want)
	}
}

func TestQ5HintsPerConceptAndMisconception(t *testing.T) {
	db := launchDataset(t)
	rows, err := db.Pool.Query(context.Background(), `select concept_id, misconception_id, count(*) as hints
from events where event_type = 'hint_shown'
group by concept_id, misconception_id order by hints desc;`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type row struct {
		Concept, Misconception string
		Hints                  int
	}
	var got []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.Concept, &r.Misconception, &r.Hints); err != nil {
			t.Fatal(err)
		}
		got = append(got, r)
	}
	want := []row{
		{"aliasing", "assignment-copies-object", 3},
		{"dynamic-allocation", "ref-holds-value", 2},
		{"aliasing", "ref-to-variable", 1},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Q5 = %+v, want %+v", got, want)
	}
}

func TestQ6PercentCompletedWholeModule(t *testing.T) {
	db := launchDataset(t)
	var pct float64
	err := db.Pool.QueryRow(context.Background(), `with per_session as (
  select session_id, count(distinct exercise_id) as done
  from events
  where event_type = 'exercise_completed' and module_id = 'linked-lists'
  group by session_id
), starters as (
  select count(distinct session_id) as n from events
  where event_type = 'exercise_started' and module_id = 'linked-lists'
)
select round(100.0 * count(*) filter (where done = 4) / nullif((select n from starters), 0), 1)
       as pct_completed_module
from per_session;`).Scan(&pct)
	if err != nil {
		t.Fatal(err)
	}
	if pct != 25.0 { // 1 (s1) of 4 starters; s1's repeated LL-01 still counts as 4 distinct exercises
		t.Fatalf("Q6 = %v, want 25.0", pct)
	}
}

func TestQ7RequestedTopics(t *testing.T) {
	db := launchDataset(t)
	rows, err := db.Pool.Query(context.Background(), `select requested_topic, count(*) from feedback
where requested_topic is not null group by requested_topic order by count(*) desc;`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type row struct {
		Topic string
		N     int
	}
	var got []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.Topic, &r.N); err != nil {
			t.Fatal(err)
		}
		got = append(got, r)
	}
	want := []row{{"doubly-linked-lists", 3}, {"recursion", 2}, {"big-o", 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Q7 = %+v, want %+v", got, want)
	}
}
