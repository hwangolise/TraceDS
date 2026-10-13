package api_test

import (
	"net/http"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"traceds/backend/internal/store"
)

// B4–B7, B12 — POST /api/v1/events (ARCHITECTURE §9.2, ANALYTICS §3–§4).

// fieldRules is a hand transcription of the ANALYTICS §3 event catalog:
// R = required, O = optional, everything else must be absent.
var fieldRules = map[string]struct{ required, optional []string }{
	"session_started":    {},
	"module_selected":    {required: []string{"module_id"}},
	"exercise_started":   {required: []string{"module_id", "exercise_id", "run_id"}},
	"answer_submitted":   {required: []string{"module_id", "exercise_id", "run_id", "step_id", "choice_id", "correct", "attempt_number", "concept_id"}, optional: []string{"misconception_id"}},
	"hint_shown":         {required: []string{"module_id", "exercise_id", "run_id", "step_id", "choice_id", "attempt_number", "concept_id", "misconception_id"}},
	"exercise_completed": {required: []string{"module_id", "exercise_id", "run_id"}},
	"survey_submitted":   {optional: []string{"module_id", "exercise_id"}},
}

var allEventFields = []string{"module_id", "exercise_id", "run_id", "step_id", "choice_id", "correct", "attempt_number", "concept_id", "misconception_id"}

const sampleTS = "2026-10-12T21:30:00.000Z"

// sampleValue is a valid value for each per-event field.
func sampleValue(t *testing.T, field string) any {
	switch field {
	case "module_id":
		return "linked-lists"
	case "exercise_id":
		return "LL-01"
	case "run_id":
		return newUUID(t)
	case "step_id":
		return "ll01-c3"
	case "choice_id":
		return "a"
	case "correct":
		return true
	case "attempt_number":
		return 1
	case "concept_id":
		return "aliasing"
	case "misconception_id":
		return "assignment-copies-object"
	}
	t.Fatalf("unknown field %q", field)
	return nil
}

// minimalEvent returns a valid event of the given type carrying exactly its
// required fields. answer_submitted is the correct variant (misconception optional).
func minimalEvent(t *testing.T, eventType string) obj {
	t.Helper()
	ev := obj{"event_id": newUUID(t), "event_type": eventType, "client_ts": sampleTS}
	for _, f := range fieldRules[eventType].required {
		ev[f] = sampleValue(t, f)
	}
	return ev
}

func batch(sessionID string, events ...obj) obj {
	list := make([]any, len(events))
	for i, e := range events {
		list[i] = e
	}
	return obj{"session_id": sessionID, "events": list}
}

func sortedTypes() []string {
	types := make([]string, 0, len(fieldRules))
	for k := range fieldRules {
		types = append(types, k)
	}
	sort.Strings(types)
	return types
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// expectEvents compares stored rows with the expected ones, comparing ClientTS by instant.
func expectEvents(t *testing.T, got, want []store.Event) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("stored %d events, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		g, w := got[i], want[i]
		if (g.ClientTS == nil) != (w.ClientTS == nil) || (g.ClientTS != nil && !g.ClientTS.Equal(*w.ClientTS)) {
			t.Fatalf("event %d ClientTS = %v, want %v", i, g.ClientTS, w.ClientTS)
		}
		g.ClientTS, w.ClientTS = nil, nil
		if !reflect.DeepEqual(g, w) {
			t.Fatalf("event %d stored as\n  %s\nwant\n  %s", i, dump(g), dump(w))
		}
	}
}

func dump(e store.Event) string {
	s := func(p *string) string {
		if p == nil {
			return "<nil>"
		}
		return *p
	}
	c := "<nil>"
	if e.Correct != nil {
		c = strconv.FormatBool(*e.Correct)
	}
	a := "<nil>"
	if e.AttemptNumber != nil {
		a = strconv.Itoa(*e.AttemptNumber)
	}
	return strings.Join([]string{"id=" + e.ID, "session=" + e.SessionID, "run=" + s(e.RunID), "type=" + e.EventType,
		"module=" + s(e.ModuleID), "exercise=" + s(e.ExerciseID), "step=" + s(e.StepID), "choice=" + s(e.ChoiceID),
		"correct=" + c, "attempt=" + a, "concept=" + s(e.ConceptID), "misconception=" + s(e.MisconceptionID)}, " ")
}

func parseTS(t *testing.T, s string) *time.Time {
	t.Helper()
	ts, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatal(err)
	}
	return &ts
}

// --- B4: valid events are accepted and stored exactly ---

func TestB4EachEventTypeAcceptedWithOnlyRequiredFields(t *testing.T) {
	for _, eventType := range sortedTypes() {
		t.Run(eventType, func(t *testing.T) {
			h, mem := newServer(t)
			session := newUUID(t)
			ev := minimalEvent(t, eventType)
			rec := postJSON(t, h, "/api/v1/events", batch(session, ev))
			expectStatus(t, rec, http.StatusAccepted)
			expectJSONContentType(t, rec)
			if got, want := decodeObject(t, rec), (obj{"accepted": float64(1)}); !reflect.DeepEqual(got, want) {
				t.Fatalf("body = %v, want %v", got, want)
			}
			got := mem.Events()
			if len(got) != 1 || got[0].ID != ev["event_id"] || got[0].EventType != eventType || got[0].SessionID != session {
				t.Fatalf("stored = %+v, want one %s event %v in session %s", got, eventType, ev["event_id"], session)
			}
		})
	}
}

func TestB4OptionalFieldsAccepted(t *testing.T) {
	cases := map[string]obj{
		"incorrect answer_submitted with misconception_id": func() obj {
			ev := minimalEvent(t, "answer_submitted")
			ev["correct"] = false
			ev["misconception_id"] = "assignment-copies-object"
			return ev
		}(),
		"survey_submitted with module_id and exercise_id": func() obj {
			ev := minimalEvent(t, "survey_submitted")
			ev["module_id"] = "linked-lists"
			ev["exercise_id"] = "LL-04"
			return ev
		}(),
	}
	for name, ev := range cases {
		t.Run(name, func(t *testing.T) {
			h, mem := newServer(t)
			expectStatus(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)), http.StatusAccepted)
			if len(mem.Events()) != 1 {
				t.Fatalf("stored %d events, want 1", len(mem.Events()))
			}
		})
	}
}

func TestB4StoredRowsMatchEveryField(t *testing.T) {
	h, mem := newServer(t)
	session, run := newUUID(t), newUUID(t)
	ids := []string{newUUID(t), newUUID(t), newUUID(t), newUUID(t)}
	body := batch(session,
		obj{"event_id": ids[0], "event_type": "session_started", "client_ts": "2026-10-12T21:29:58.125Z"},
		obj{"event_id": ids[1], "event_type": "answer_submitted", "run_id": run,
			"module_id": "linked-lists", "exercise_id": "LL-01", "step_id": "ll01-c3",
			"choice_id": "a", "correct": false, "attempt_number": 1,
			"concept_id": "aliasing", "misconception_id": "assignment-copies-object",
			"client_ts": "2026-10-12T21:30:00.000Z"},
		obj{"event_id": ids[2], "event_type": "hint_shown", "run_id": run,
			"module_id": "linked-lists", "exercise_id": "LL-01", "step_id": "ll01-c3",
			"choice_id": "a", "attempt_number": 1,
			"concept_id": "aliasing", "misconception_id": "assignment-copies-object",
			"client_ts": "2026-10-12T21:30:00.001Z"},
		obj{"event_id": ids[3], "event_type": "answer_submitted", "run_id": run,
			"module_id": "linked-lists", "exercise_id": "LL-01", "step_id": "ll01-c3",
			"choice_id": "d", "correct": true, "attempt_number": 2,
			"concept_id": "aliasing", "client_ts": "2026-10-12T21:30:07.500Z"},
	)
	rec := postJSON(t, h, "/api/v1/events", body)
	expectStatus(t, rec, http.StatusAccepted)
	if got, want := decodeObject(t, rec), (obj{"accepted": float64(4)}); !reflect.DeepEqual(got, want) {
		t.Fatalf("body = %v, want %v", got, want)
	}

	expectEvents(t, mem.Events(), []store.Event{
		{ID: ids[0], SessionID: session, EventType: "session_started", ClientTS: parseTS(t, "2026-10-12T21:29:58.125Z")},
		{ID: ids[1], SessionID: session, RunID: strp(run), EventType: "answer_submitted",
			ModuleID: strp("linked-lists"), ExerciseID: strp("LL-01"), StepID: strp("ll01-c3"),
			ChoiceID: strp("a"), Correct: boolp(false), AttemptNumber: intp(1),
			ConceptID: strp("aliasing"), MisconceptionID: strp("assignment-copies-object"),
			ClientTS: parseTS(t, "2026-10-12T21:30:00.000Z")},
		{ID: ids[2], SessionID: session, RunID: strp(run), EventType: "hint_shown",
			ModuleID: strp("linked-lists"), ExerciseID: strp("LL-01"), StepID: strp("ll01-c3"),
			ChoiceID: strp("a"), AttemptNumber: intp(1),
			ConceptID: strp("aliasing"), MisconceptionID: strp("assignment-copies-object"),
			ClientTS: parseTS(t, "2026-10-12T21:30:00.001Z")},
		{ID: ids[3], SessionID: session, RunID: strp(run), EventType: "answer_submitted",
			ModuleID: strp("linked-lists"), ExerciseID: strp("LL-01"), StepID: strp("ll01-c3"),
			ChoiceID: strp("d"), Correct: boolp(true), AttemptNumber: intp(2),
			ConceptID: strp("aliasing"), ClientTS: parseTS(t, "2026-10-12T21:30:07.500Z")},
	})
}

func TestB4CompletionEventStored(t *testing.T) {
	h, mem := newServer(t)
	session, run, id := newUUID(t), newUUID(t), newUUID(t)
	body := batch(session, obj{"event_id": id, "event_type": "exercise_completed", "run_id": run,
		"module_id": "linked-lists", "exercise_id": "LL-04", "client_ts": sampleTS})
	expectStatus(t, postJSON(t, h, "/api/v1/events", body), http.StatusAccepted)
	expectEvents(t, mem.Events(), []store.Event{{ID: id, SessionID: session, RunID: strp(run),
		EventType: "exercise_completed", ModuleID: strp("linked-lists"), ExerciseID: strp("LL-04"),
		ClientTS: parseTS(t, sampleTS)}})
}

func TestB4EventsBelongToTheirBatchSession(t *testing.T) {
	h, mem := newServer(t)
	s1, s2 := newUUID(t), newUUID(t)
	e1, e2 := minimalEvent(t, "module_selected"), minimalEvent(t, "module_selected")
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(s1, e1)), http.StatusAccepted)
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(s2, e2)), http.StatusAccepted)
	owner := map[string]string{}
	for _, e := range mem.Events() {
		owner[e.ID] = e.SessionID
	}
	want := map[string]string{e1["event_id"].(string): s1, e2["event_id"].(string): s2}
	if !reflect.DeepEqual(owner, want) {
		t.Fatalf("event → session = %v, want %v", owner, want)
	}
}

func TestB4BatchOf50Accepted(t *testing.T) {
	h, mem := newServer(t)
	events := make([]obj, 50)
	for i := range events {
		events[i] = minimalEvent(t, "session_started")
	}
	rec := postJSON(t, h, "/api/v1/events", batch(newUUID(t), events...))
	expectStatus(t, rec, http.StatusAccepted)
	if got, want := decodeObject(t, rec), (obj{"accepted": float64(50)}); !reflect.DeepEqual(got, want) {
		t.Fatalf("body = %v, want %v", got, want)
	}
	if len(mem.Events()) != 50 {
		t.Fatalf("stored %d events, want 50", len(mem.Events()))
	}
}

func TestB4BoundaryValuesAccepted(t *testing.T) {
	cases := map[string]func(obj){
		"attempt_number 1":           func(e obj) { e["attempt_number"] = 1 },
		"attempt_number 10":          func(e obj) { e["attempt_number"] = 10 },
		"64-character id":            func(e obj) { e["step_id"] = strings.Repeat("a", 64) },
		"1-character id":             func(e obj) { e["concept_id"] = "x" },
		"id with upper, digit, _, -": func(e obj) { e["exercise_id"] = "LL-01_b" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			h, _ := newServer(t)
			ev := minimalEvent(t, "answer_submitted")
			mutate(ev)
			expectStatus(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)), http.StatusAccepted)
		})
	}
}

// --- B5: events upsert the session ---

func TestB5EventsForUnknownSessionCreateIt(t *testing.T) {
	h, mem := newServer(t)
	session := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, minimalEvent(t, "session_started"))), http.StatusAccepted)
	want := []store.Session{{ID: session}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
	if len(mem.Events()) != 1 {
		t.Fatalf("stored %d events, want 1", len(mem.Events()))
	}
}

func TestB5EventsForExistingSessionKeepIt(t *testing.T) {
	h, mem := newServer(t)
	session := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": session, "app_version": "v1", "viewport": "wide"}), http.StatusCreated)
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, minimalEvent(t, "session_started"))), http.StatusAccepted)
	want := []store.Session{{ID: session, AppVersion: strp("v1"), Viewport: strp("wide")}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
}

// --- B6: idempotency by event_id ---

func TestB6SameBatchTwiceStoresOneRowPerEvent(t *testing.T) {
	h, mem := newServer(t)
	session := newUUID(t)
	ev := minimalEvent(t, "exercise_completed")
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, ev)), http.StatusAccepted)
	first := mem.Events()
	retry := postJSON(t, h, "/api/v1/events", batch(session, ev))
	expectStatus(t, retry, http.StatusAccepted)
	expectAccepted(t, retry, 0)
	expectEvents(t, mem.Events(), first)
	if len(first) != 1 {
		t.Fatalf("stored %d events after the first post, want 1", len(first))
	}
}

func TestB6RetryMixedWithNewEvents(t *testing.T) {
	h, mem := newServer(t)
	session := newUUID(t)
	a, b := minimalEvent(t, "exercise_started"), minimalEvent(t, "exercise_started")
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, a)), http.StatusAccepted)
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, a, b)), http.StatusAccepted)
	ids := map[string]int{}
	for _, e := range mem.Events() {
		ids[e.ID]++
	}
	want := map[string]int{a["event_id"].(string): 1, b["event_id"].(string): 1}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("event id counts = %v, want %v", ids, want)
	}
}

func TestB6AcceptedCountsOnlyNewRows(t *testing.T) {
	// Decision E (M7A review): {"accepted": n} is the number of NEW rows.
	h, _ := newServer(t)
	session := newUUID(t)
	e1, e2, e3, e4 := minimalEvent(t, "module_selected"), minimalEvent(t, "module_selected"), minimalEvent(t, "module_selected"), minimalEvent(t, "module_selected")

	first := postJSON(t, h, "/api/v1/events", batch(session, e1, e2, e3))
	expectStatus(t, first, http.StatusAccepted)
	expectAccepted(t, first, 3)

	identical := postJSON(t, h, "/api/v1/events", batch(session, e1, e2, e3))
	expectStatus(t, identical, http.StatusAccepted)
	expectAccepted(t, identical, 0)

	mixed := postJSON(t, h, "/api/v1/events", batch(session, e1, e2, e4))
	expectStatus(t, mixed, http.StatusAccepted)
	expectAccepted(t, mixed, 1)
}

func TestB6DuplicateIDWithinBatchStoredAndCountedOnce(t *testing.T) {
	// Final decision 5: event_id identity wins; no error.
	h, mem := newServer(t)
	session := newUUID(t)
	ev := minimalEvent(t, "exercise_completed")
	rec := postJSON(t, h, "/api/v1/events", batch(session, ev, ev))
	expectStatus(t, rec, http.StatusAccepted)
	expectAccepted(t, rec, 1)
	if got := mem.Events(); len(got) != 1 || got[0].ID != ev["event_id"] {
		t.Fatalf("stored = %+v, want exactly one row for %v", got, ev["event_id"])
	}
}

func TestB6StoredIDUnderAnotherSessionNotDuplicatedOrReowned(t *testing.T) {
	h, mem := newServer(t)
	owner, other := newUUID(t), newUUID(t)
	ev := minimalEvent(t, "module_selected")
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(owner, ev)), http.StatusAccepted)
	rec := postJSON(t, h, "/api/v1/events", batch(other, ev))
	expectStatus(t, rec, http.StatusAccepted)
	expectAccepted(t, rec, 0)
	got := mem.Events()
	if len(got) != 1 || got[0].SessionID != owner {
		t.Fatalf("stored = %+v, want one row still owned by %s", got, owner)
	}
}

func TestB6CompletionRetriedIsCountedOnce(t *testing.T) {
	// "Completion is recorded once per run": a client retry of the same
	// exercise_completed event must not produce a second completion row.
	h, mem := newServer(t)
	session := newUUID(t)
	ev := minimalEvent(t, "exercise_completed")
	for i := 0; i < 3; i++ {
		expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, ev)), http.StatusAccepted)
	}
	n := 0
	for _, e := range mem.Events() {
		if e.EventType == "exercise_completed" {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("%d exercise_completed rows after 3 deliveries of one event, want 1", n)
	}
}

// --- B7: validation ---

func TestB7RequiredFieldMissingRejected(t *testing.T) {
	for _, eventType := range sortedTypes() {
		for _, field := range fieldRules[eventType].required {
			t.Run(eventType+" without "+field, func(t *testing.T) {
				h, mem := newServer(t)
				ev := minimalEvent(t, eventType)
				delete(ev, field)
				expectBadRequest(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)))
				if len(mem.Events()) != 0 {
					t.Fatalf("rejected event was stored")
				}
			})
			t.Run(eventType+" with "+field+" null", func(t *testing.T) {
				h, mem := newServer(t)
				ev := minimalEvent(t, eventType)
				ev[field] = nil
				expectBadRequest(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)))
				if len(mem.Events()) != 0 {
					t.Fatalf("rejected event was stored")
				}
			})
		}
	}
}

func TestB7AbsentFieldPresentRejected(t *testing.T) {
	for _, eventType := range sortedTypes() {
		rules := fieldRules[eventType]
		for _, field := range allEventFields {
			if contains(rules.required, field) || contains(rules.optional, field) {
				continue
			}
			t.Run(eventType+" with "+field, func(t *testing.T) {
				h, mem := newServer(t)
				ev := minimalEvent(t, eventType)
				ev[field] = sampleValue(t, field)
				expectBadRequest(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)))
				if len(mem.Events()) != 0 {
					t.Fatalf("rejected event was stored")
				}
			})
			// Decision C (M7A review): explicit null is not absence.
			t.Run(eventType+" with "+field+" null", func(t *testing.T) {
				h, mem := newServer(t)
				ev := minimalEvent(t, eventType)
				ev[field] = nil
				expectBadRequest(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)))
				if len(mem.Events()) != 0 {
					t.Fatalf("rejected event was stored")
				}
			})
		}
	}
}

func TestB7OptionalFieldNullRejected(t *testing.T) {
	// Final decision 3: optional means the key may be omitted, never that it may be null.
	for _, eventType := range sortedTypes() {
		for _, field := range fieldRules[eventType].optional {
			t.Run(eventType+" with "+field+" null", func(t *testing.T) {
				h, mem := newServer(t)
				ev := minimalEvent(t, eventType)
				ev[field] = nil
				expectBadRequest(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)))
				if len(mem.Events()) != 0 {
					t.Fatalf("rejected event was stored")
				}
			})
		}
	}
}

func TestB7EventValidation(t *testing.T) {
	answer := func(t *testing.T, mutate func(obj)) func(t *testing.T) obj {
		return func(t *testing.T) obj {
			session := newUUID(t)
			ev := minimalEvent(t, "answer_submitted")
			mutate(ev)
			return batch(session, ev)
		}
	}
	setField := func(k string, v any) func(obj) { return func(e obj) { e[k] = v } }

	cases := []struct {
		name string
		body func(t *testing.T) obj
	}{
		{"unsupported event_type", answer(t, setField("event_type", "page_view"))},
		{"event_type wrong case", answer(t, setField("event_type", "Answer_Submitted"))},
		{"empty event_type", answer(t, setField("event_type", ""))},
		{"missing event_type", answer(t, func(e obj) { delete(e, "event_type") })},
		{"missing event_id", answer(t, func(e obj) { delete(e, "event_id") })},
		{"invalid event_id UUID", answer(t, setField("event_id", "evt-1"))},
		{"invalid run_id UUID", answer(t, setField("run_id", "12345"))},
		{"attempt_number 0", answer(t, setField("attempt_number", 0))},
		{"attempt_number 11", answer(t, setField("attempt_number", 11))},
		{"attempt_number negative", answer(t, setField("attempt_number", -1))},
		{"attempt_number fractional", answer(t, setField("attempt_number", 1.5))},
		{"attempt_number as string", answer(t, setField("attempt_number", "1"))},
		{"correct as string", answer(t, setField("correct", "false"))},
		{"correct as number", answer(t, setField("correct", 0))},
		{"incorrect answer without misconception_id", answer(t, setField("correct", false))},
		{"id with a space", answer(t, setField("module_id", "linked lists"))},
		{"empty id", answer(t, setField("exercise_id", ""))},
		{"65-character id", answer(t, setField("step_id", strings.Repeat("a", 65)))},
		{"id with punctuation", answer(t, setField("concept_id", "aliasing;drop"))},
		{"id with non-ASCII", answer(t, setField("choice_id", "é"))},
		{"misconception id bad pattern", func(t *testing.T) obj {
			ev := minimalEvent(t, "answer_submitted")
			ev["correct"] = false
			ev["misconception_id"] = "assignment copies object"
			return batch(newUUID(t), ev)
		}},
		{"unknown event field", answer(t, setField("score", 3))},
		{"PII event field name", answer(t, setField("name", "Ada"))},
		{"PII event field email", answer(t, setField("email", "a@b.edu"))},
		{"PII event field student_id", answer(t, setField("student_id", "12345"))},
		{"PII event field ip_address", answer(t, setField("ip_address", "10.0.0.1"))},
		{"PII top-level field email", func(t *testing.T) obj {
			b := batch(newUUID(t), minimalEvent(t, "session_started"))
			b["email"] = "a@b.edu"
			return b
		}},
		{"PII top-level field student_id", func(t *testing.T) obj {
			b := batch(newUUID(t), minimalEvent(t, "session_started"))
			b["student_id"] = "12345"
			return b
		}},
		{"invalid session_id UUID", func(t *testing.T) obj { return batch("session-1", minimalEvent(t, "session_started")) }},
		{"missing session_id", func(t *testing.T) obj { return obj{"events": []any{minimalEvent(t, "session_started")}} }},
		{"missing events", func(t *testing.T) obj { return obj{"session_id": newUUID(t)} }},
		{"empty events", func(t *testing.T) obj { return obj{"session_id": newUUID(t), "events": []any{}} }},
		{"events null", func(t *testing.T) obj { return obj{"session_id": newUUID(t), "events": nil} }},
		{"events not an array", func(t *testing.T) obj {
			return obj{"session_id": newUUID(t), "events": minimalEvent(t, "session_started")}
		}},
		{"event not an object", func(t *testing.T) obj { return obj{"session_id": newUUID(t), "events": []any{"session_started"}} }},
		{"51 events", func(t *testing.T) obj {
			events := make([]obj, 51)
			for i := range events {
				events[i] = minimalEvent(t, "session_started")
			}
			return batch(newUUID(t), events...)
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, mem := newServer(t)
			expectBadRequest(t, postJSON(t, h, "/api/v1/events", c.body(t)))
			if len(mem.Events()) != 0 {
				t.Fatalf("rejected batch stored events: %+v", mem.Events())
			}
		})
	}
}

func TestB7MalformedJSONRejected(t *testing.T) {
	for name, raw := range map[string]string{
		"truncated":  `{"session_id":"`,
		"empty body": ``,
		"array":      `[]`,
	} {
		t.Run(name, func(t *testing.T) {
			h, _ := newServer(t)
			expectBadRequest(t, postRaw(t, h, "/api/v1/events", raw))
		})
	}
}

func TestB7OneInvalidEventRejectsWholeBatch(t *testing.T) {
	h, mem := newServer(t)
	bad := minimalEvent(t, "exercise_started")
	delete(bad, "run_id")
	rec := postJSON(t, h, "/api/v1/events", batch(newUUID(t), minimalEvent(t, "session_started"), bad))
	expectBadRequest(t, rec)
	if len(mem.Events()) != 0 {
		t.Fatalf("a partially invalid batch stored events: %+v", mem.Events())
	}
}

func TestB7BodyOver64KiBIs413(t *testing.T) {
	h, mem := newServer(t)
	body := batch(newUUID(t), minimalEvent(t, "session_started"))
	rec := postRaw(t, h, "/api/v1/events", padInside(t, body, 65*1024))
	expectStatus(t, rec, http.StatusRequestEntityTooLarge)
	expectErrorShape(t, rec)
	if len(mem.Events()) != 0 {
		t.Fatalf("oversized body stored events")
	}
}

func TestB7BodyJustUnderLimitAccepted(t *testing.T) {
	// Control: the same padded shape under 64 KiB succeeds, so the case above fails on size alone.
	h, _ := newServer(t)
	body := batch(newUUID(t), minimalEvent(t, "session_started"))
	expectStatus(t, postRaw(t, h, "/api/v1/events", padInside(t, body, 60*1024)), http.StatusAccepted)
}

// --- B12: database failure ---

func TestB12EventsStoreFailureIs5xx(t *testing.T) {
	_, mem := newServer(t)
	h := newServerWith(failingStore{Store: mem, failEvents: true})
	rec := postJSON(t, h, "/api/v1/events", batch(newUUID(t), minimalEvent(t, "session_started")))
	if rec.Code < 500 {
		t.Fatalf("status = %d, want 5xx so the client retries (ANALYTICS §4)", rec.Code)
	}
	expectErrorShape(t, rec)
	expectNoInternalDetails(t, rec)
}

// --- B7/B4: client_ts is required RFC 3339 (decision D, M7A review) ---

func TestB7ClientTimestampRequiredAndValid(t *testing.T) {
	cases := map[string]func(obj){
		"missing client_ts":                 func(e obj) { delete(e, "client_ts") },
		"null client_ts":                    func(e obj) { e["client_ts"] = nil },
		"empty client_ts":                   func(e obj) { e["client_ts"] = "" },
		"client_ts as a number":             func(e obj) { e["client_ts"] = 1760304600000 },
		"date only":                         func(e obj) { e["client_ts"] = "2026-10-12" },
		"space instead of T, no zone":       func(e obj) { e["client_ts"] = "2026-10-12 21:30:00" },
		"no time zone":                      func(e obj) { e["client_ts"] = "2026-10-12T21:30:00.000" },
		"month 13":                          func(e obj) { e["client_ts"] = "2026-13-12T21:30:00.000Z" },
		"hour 25":                           func(e obj) { e["client_ts"] = "2026-10-12T25:30:00.000Z" },
		"free text":                         func(e obj) { e["client_ts"] = "yesterday" },
		"JavaScript Date.toString() format": func(e obj) { e["client_ts"] = "Mon Oct 12 2026 16:30:00 GMT-0500" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			h, mem := newServer(t)
			ev := minimalEvent(t, "session_started")
			mutate(ev)
			expectBadRequest(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)))
			if len(mem.Events()) != 0 {
				t.Fatalf("rejected event was stored")
			}
		})
	}
}

func TestB4ValidClientTimestampsAcceptedAndStored(t *testing.T) {
	cases := map[string]string{
		"Date.toISOString() format": "2026-10-12T21:30:00.000Z",
		"RFC 3339 without fraction": "2026-10-12T21:30:00Z",
		"RFC 3339 numeric offset":   "2026-10-12T16:30:00-05:00", // decision 4: same instant as 21:30Z
	}
	for name, ts := range cases {
		t.Run(name, func(t *testing.T) {
			h, mem := newServer(t)
			ev := minimalEvent(t, "session_started")
			ev["client_ts"] = ts
			expectStatus(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), ev)), http.StatusAccepted)
			got := mem.Events()
			if len(got) != 1 || got[0].ClientTS == nil || !got[0].ClientTS.Equal(*parseTS(t, "2026-10-12T21:30:00Z")) {
				t.Fatalf("stored = %+v, want client_ts 2026-10-12T21:30:00Z", got)
			}
		})
	}
}

// --- B4: order is preserved (EVENT ORDER, M7A review) ---

func TestB4BatchOrderPreservedInStorage(t *testing.T) {
	h, mem := newServer(t)
	session, run := newUUID(t), newUUID(t)
	step := func(typ string, extra obj) obj {
		ev := obj{"event_id": newUUID(t), "event_type": typ, "run_id": run, "module_id": "linked-lists",
			"exercise_id": "LL-01", "client_ts": sampleTS} // identical client_ts: order must not depend on it
		for k, v := range extra {
			ev[k] = v
		}
		return ev
	}
	wrong := obj{"step_id": "ll01-c6", "choice_id": "a", "attempt_number": 1, "concept_id": "aliasing", "misconception_id": "stale-position"}
	answerWrong := step("answer_submitted", wrong)
	answerWrong["correct"] = false
	hint := step("hint_shown", wrong)
	answerRight := step("answer_submitted", obj{"step_id": "ll01-c6", "choice_id": "c", "correct": true, "attempt_number": 2, "concept_id": "aliasing"})
	completed := step("exercise_completed", nil)

	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, answerWrong, hint, answerRight, completed)), http.StatusAccepted)
	later := minimalEvent(t, "module_selected")
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, later)), http.StatusAccepted)

	var got []string
	for _, e := range mem.Events() {
		got = append(got, e.ID)
	}
	want := []string{answerWrong["event_id"].(string), hint["event_id"].(string), answerRight["event_id"].(string),
		completed["event_id"].(string), later["event_id"].(string)}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stored order = %v, want %v", got, want)
	}
}

func TestB4LongInterleavedBatchKeepsOrder(t *testing.T) {
	h, mem := newServer(t)
	types := []string{"module_selected", "exercise_started", "exercise_completed"}
	events := make([]obj, 30)
	var want []string
	for i := range events {
		events[i] = minimalEvent(t, types[i%len(types)])
		want = append(want, events[i]["event_id"].(string))
	}
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(newUUID(t), events...)), http.StatusAccepted)
	var got []string
	for _, e := range mem.Events() {
		got = append(got, e.ID)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stored order differs from batch order")
	}
}
