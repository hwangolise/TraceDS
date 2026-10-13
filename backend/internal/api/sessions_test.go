package api_test

import (
	"net/http"
	"reflect"
	"testing"

	"traceds/backend/internal/store"
)

// B2 — anonymous session creation; B3 — session validation
// (ARCHITECTURE §9.2 POST /api/v1/sessions; ANALYTICS §2).

func TestB2SessionCreatedThen200OnRepeat(t *testing.T) {
	h, mem := newServer(t)
	id := newUUID(t)
	body := obj{"session_id": id, "app_version": "2026.10.12-abc123", "viewport": "narrow"}

	first := postJSON(t, h, "/api/v1/sessions", body)
	expectStatus(t, first, http.StatusCreated)
	expectJSONContentType(t, first)
	if got, want := decodeObject(t, first), (obj{"session_id": id}); !reflect.DeepEqual(got, want) {
		t.Fatalf("201 body = %v, want %v", got, want)
	}

	again := postJSON(t, h, "/api/v1/sessions", body)
	expectStatus(t, again, http.StatusOK)
	if got, want := decodeObject(t, again), (obj{"session_id": id}); !reflect.DeepEqual(got, want) {
		t.Fatalf("200 body = %v, want %v", got, want)
	}

	want := []store.Session{{ID: id, AppVersion: strp("2026.10.12-abc123"), Viewport: strp("narrow")}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("stored sessions = %+v, want exactly one row %+v", got, want)
	}
}

func TestB2SessionWithOnlySessionID(t *testing.T) {
	h, mem := newServer(t)
	id := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id}), http.StatusCreated)
	want := []store.Session{{ID: id}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("stored sessions = %+v, want %+v (optional fields absent)", got, want)
	}
}

func TestB2SessionWideViewport(t *testing.T) {
	h, mem := newServer(t)
	id := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "viewport": "wide"}), http.StatusCreated)
	want := []store.Session{{ID: id, Viewport: strp("wide")}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("stored sessions = %+v, want %+v", got, want)
	}
}

func TestB2RepeatDoesNotOverwrite(t *testing.T) {
	// ON CONFLICT DO NOTHING: a repeat with different optional fields keeps the first row.
	h, mem := newServer(t)
	id := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "viewport": "narrow"}), http.StatusCreated)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "viewport": "wide"}), http.StatusOK)
	want := []store.Session{{ID: id, Viewport: strp("narrow")}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("stored sessions = %+v, want %+v", got, want)
	}
}

func TestB3SessionValidation(t *testing.T) {
	valid := func(t *testing.T) obj { return obj{"session_id": newUUID(t)} }
	with := func(t *testing.T, k string, v any) obj { o := valid(t); o[k] = v; return o }

	cases := []struct {
		name string
		raw  func(t *testing.T) string
	}{
		{"malformed JSON", func(t *testing.T) string { return `{"session_id": ` }},
		{"empty body", func(t *testing.T) string { return `` }},
		{"JSON array", func(t *testing.T) string { return `[]` }},
		{"JSON null", func(t *testing.T) string { return `null` }},
		{"missing session_id", func(t *testing.T) string { return `{"viewport":"wide"}` }},
		{"empty session_id", func(t *testing.T) string { return `{"session_id":""}` }},
		{"bad UUID", func(t *testing.T) string { return `{"session_id":"not-a-uuid"}` }},
		{"UUID with a non-hex digit", func(t *testing.T) string { return `{"session_id":"0f8fad5b-d9cb-469f-a165-70867728950g"}` }},
		{"UUID missing a group", func(t *testing.T) string { return `{"session_id":"0f8fad5b-d9cb-469f-a165"}` }},
		{"session_id not a string", func(t *testing.T) string { return `{"session_id":123}` }},
		{"unknown viewport", func(t *testing.T) string { return string(mustJSON(t, with(t, "viewport", "tablet"))) }},
		{"viewport not a string", func(t *testing.T) string { return string(mustJSON(t, with(t, "viewport", 390))) }},
		{"app_version not a string", func(t *testing.T) string { return string(mustJSON(t, with(t, "app_version", 7))) }},
		{"unknown field", func(t *testing.T) string { return string(mustJSON(t, with(t, "theme", "dark"))) }},
		{"PII field email", func(t *testing.T) string { return string(mustJSON(t, with(t, "email", "a@b.edu"))) }},
		{"PII field name", func(t *testing.T) string { return string(mustJSON(t, with(t, "name", "Ada"))) }},
		{"PII field student_id", func(t *testing.T) string { return string(mustJSON(t, with(t, "student_id", "12345"))) }},
		{"PII field ip_address", func(t *testing.T) string { return string(mustJSON(t, with(t, "ip_address", "10.0.0.1"))) }},
		{"PII field user_agent", func(t *testing.T) string { return string(mustJSON(t, with(t, "user_agent", "Mozilla/5.0"))) }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, mem := newServer(t)
			expectBadRequest(t, postRaw(t, h, "/api/v1/sessions", c.raw(t)))
			if got := mem.Sessions(); len(got) != 0 {
				t.Fatalf("rejected request stored sessions: %+v", got)
			}
		})
	}
}

func TestB3SessionBodyOver64KiBIs413(t *testing.T) {
	h, mem := newServer(t)
	rec := postRaw(t, h, "/api/v1/sessions", padInside(t, obj{"session_id": newUUID(t)}, 65*1024))
	expectStatus(t, rec, http.StatusRequestEntityTooLarge)
	expectErrorShape(t, rec)
	if got := mem.Sessions(); len(got) != 0 {
		t.Fatalf("oversized request stored sessions: %+v", got)
	}
}

func TestB3SessionBodyJustUnderLimitAccepted(t *testing.T) {
	// Control for the 64 KiB case: the same padded shape under the limit succeeds,
	// so that rejection is caused by size alone.
	h, _ := newServer(t)
	rec := postRaw(t, h, "/api/v1/sessions", padInside(t, obj{"session_id": newUUID(t)}, 60*1024))
	expectStatus(t, rec, http.StatusCreated)
}

func TestB12SessionStoreFailureIs5xx(t *testing.T) {
	// A database failure is a server error (so the client's retry policy, ANALYTICS §4, applies),
	// never a 2xx that would make the client drop the data silently, and never a 4xx.
	_, mem := newServer(t)
	h := newServerWith(failingStore{Store: mem, failSessions: true})
	rec := postJSON(t, h, "/api/v1/sessions", obj{"session_id": newUUID(t)})
	if rec.Code < 500 {
		t.Fatalf("status = %d, want 5xx", rec.Code)
	}
	expectErrorShape(t, rec)
	expectNoInternalDetails(t, rec)
}

// --- B5: session enrichment and delivery-order convergence (ANALYTICS §4, ARCHITECTURE §9.2) ---

func TestB5SessionsAfterEventsEnrichesMetadata(t *testing.T) {
	h, mem := newServer(t)
	id := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(id, minimalEvent(t, "session_started"))), http.StatusAccepted)
	rec := postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "app_version": "v7", "viewport": "narrow"})
	expectStatus(t, rec, http.StatusOK) // the session already existed (created by /events)
	if got, want := decodeObject(t, rec), (obj{"session_id": id}); !reflect.DeepEqual(got, want) {
		t.Fatalf("body = %v, want %v", got, want)
	}
	want := []store.Session{{ID: id, AppVersion: strp("v7"), Viewport: strp("narrow")}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want exactly %+v (enriched, not duplicated)", got, want)
	}
}

func TestB5BothDeliveryOrdersConverge(t *testing.T) {
	id := newUUID(t)
	meta := obj{"session_id": id, "app_version": "2026.10.13-x", "viewport": "wide"}

	sessionsFirst, memA := newServer(t)
	expectStatus(t, postJSON(t, sessionsFirst, "/api/v1/sessions", meta), http.StatusCreated)
	expectStatus(t, postJSON(t, sessionsFirst, "/api/v1/events", batch(id, minimalEvent(t, "session_started"))), http.StatusAccepted)

	eventsFirst, memB := newServer(t)
	expectStatus(t, postJSON(t, eventsFirst, "/api/v1/events", batch(id, minimalEvent(t, "session_started"))), http.StatusAccepted)
	expectStatus(t, postJSON(t, eventsFirst, "/api/v1/sessions", meta), http.StatusOK)

	want := []store.Session{{ID: id, AppVersion: strp("2026.10.13-x"), Viewport: strp("wide")}}
	if a, b := memA.Sessions(), memB.Sessions(); !reflect.DeepEqual(a, want) || !reflect.DeepEqual(b, want) {
		t.Fatalf("sessions→events = %+v, events→sessions = %+v; both want %+v", a, b, want)
	}
}

func TestB5EnrichmentFillsOnlyMissingMetadata(t *testing.T) {
	// Known values are kept; only null fields are filled by a later call.
	h, mem := newServer(t)
	id := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "viewport": "narrow"}), http.StatusCreated)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "viewport": "wide", "app_version": "v2"}), http.StatusOK)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "app_version": "v3"}), http.StatusOK)
	want := []store.Session{{ID: id, AppVersion: strp("v2"), Viewport: strp("narrow")}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
}

func TestB5EventsDoNotEraseMetadata(t *testing.T) {
	h, mem := newServer(t)
	id := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id, "app_version": "v1", "viewport": "narrow"}), http.StatusCreated)
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(id, minimalEvent(t, "module_selected"))), http.StatusAccepted)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": id}), http.StatusOK)
	want := []store.Session{{ID: id, AppVersion: strp("v1"), Viewport: strp("narrow")}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
}
