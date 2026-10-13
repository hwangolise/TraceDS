package api_test

// M8 — POST /api/v1/feedback (docs/ARCHITECTURE.md §9.2, docs/ANALYTICS.md §5,
// docs/TESTING.md §M8, FB6 and the M8 backend list). Bodies are handwritten
// from the documented contract. Shared M7 validation behaviour (null policy,
// unknown fields, 413, error envelope, CORS, store timeout) is exercised here
// only as far as the feedback endpoint integrates it.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"traceds/backend/internal/api"
	"traceds/backend/internal/store"
)

const feedbackPath = "/api/v1/feedback"

// approvedTopics is the M8 enum (ANALYTICS §5, approved feedback topic enum).
var approvedTopics = []string{"linked-lists", "recursion", "quicksort", "big-o", "arrays-vs-linked-lists", "stacks"}

func validFeedback(t *testing.T) obj {
	t.Helper()
	return obj{"session_id": newUUID(t), "helpfulness": 4}
}

func with(base obj, kv ...any) obj {
	out := obj{}
	for k, v := range base {
		out[k] = v
	}
	for i := 0; i+1 < len(kv); i += 2 {
		out[kv[i].(string)] = kv[i+1]
	}
	return out
}

func without(base obj, keys ...string) obj {
	out := obj{}
	for k, v := range base {
		out[k] = v
	}
	for _, k := range keys {
		delete(out, k)
	}
	return out
}

func expectRejectedAndNothingStored(t *testing.T, h http.Handler, mem *store.Memory, body obj) {
	t.Helper()
	expectBadRequest(t, postJSON(t, h, feedbackPath, body))
	assertNothingStored(t, mem)
}

func assertNothingStored(t *testing.T, mem *store.Memory) {
	t.Helper()
	if got := mem.Feedback(); len(got) != 0 {
		t.Fatalf("feedback stored for a rejected request: %+v", got)
	}
	if got := mem.Sessions(); len(got) != 0 {
		t.Fatalf("session created for a rejected request: %+v", got)
	}
}

// --- success ---

func TestFeedbackMinimalPersists(t *testing.T) {
	h, mem := newServer(t)
	body := validFeedback(t)
	rec := postJSON(t, h, feedbackPath, body)
	expectStatus(t, rec, http.StatusCreated)
	expectJSONContentType(t, rec)
	want := []store.Feedback{{SessionID: body["session_id"].(string), Helpfulness: 4}}
	if got := mem.Feedback(); !reflect.DeepEqual(got, want) {
		t.Fatalf("feedback = %+v, want %+v", got, want)
	}
}

func TestFeedbackFullPersists(t *testing.T) {
	h, mem := newServer(t)
	body := with(validFeedback(t), "requested_topic", "recursion", "comments", "More tracing on the null case, please.")
	expectStatus(t, postJSON(t, h, feedbackPath, body), http.StatusCreated)
	want := []store.Feedback{{
		SessionID: body["session_id"].(string), Helpfulness: 4,
		RequestedTopic: strp("recursion"), Comments: strp("More tracing on the null case, please."),
	}}
	if got := mem.Feedback(); !reflect.DeepEqual(got, want) {
		t.Fatalf("feedback = %+v, want %+v", got, want)
	}
}

func TestFeedbackCreatesSessionWhenMissingAndKeepsExisting(t *testing.T) {
	// Session semantics follow /events: the session row is created first if missing.
	h, mem := newServer(t)
	fresh := validFeedback(t)
	expectStatus(t, postJSON(t, h, feedbackPath, fresh), http.StatusCreated)
	if got := mem.Sessions(); len(got) != 1 || got[0].ID != fresh["session_id"] {
		t.Fatalf("sessions after feedback-first = %+v", got)
	}

	known := newUUID(t)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": known, "viewport": "wide"}), http.StatusCreated)
	expectStatus(t, postJSON(t, h, feedbackPath, obj{"session_id": known, "helpfulness": 2}), http.StatusCreated)
	for _, s := range mem.Sessions() {
		if s.ID == known && (s.Viewport == nil || *s.Viewport != "wide") {
			t.Fatalf("existing session metadata changed: %+v", s)
		}
	}
	if n := len(mem.Sessions()); n != 2 {
		t.Fatalf("sessions = %d, want 2 (no duplicate for the known session)", n)
	}
}

func TestFeedbackUppercaseSessionUUIDIsNormalised(t *testing.T) {
	h, mem := newServer(t)
	id := newUUID(t)
	expectStatus(t, postJSON(t, h, feedbackPath, obj{"session_id": strings.ToUpper(id), "helpfulness": 3}), http.StatusCreated)
	if got := mem.Feedback(); len(got) != 1 || got[0].SessionID != id {
		t.Fatalf("feedback = %+v, want session %s lowercase", got, id)
	}
}

// --- helpfulness ---

func TestFeedbackHelpfulnessBoundaries(t *testing.T) {
	for _, n := range []int{1, 2, 3, 4, 5} {
		h, mem := newServer(t)
		expectStatus(t, postJSON(t, h, feedbackPath, with(validFeedback(t), "helpfulness", n)), http.StatusCreated)
		if got := mem.Feedback(); len(got) != 1 || got[0].Helpfulness != n {
			t.Fatalf("helpfulness %d stored as %+v", n, got)
		}
	}
	for _, n := range []int{0, 6, -1, 100} {
		h, mem := newServer(t)
		expectRejectedAndNothingStored(t, h, mem, with(validFeedback(t), "helpfulness", n))
	}
}

func TestFeedbackHelpfulnessMustBeAnInteger(t *testing.T) {
	sid := newUUID(t)
	for name, raw := range map[string]string{
		"fraction":      `4.5`,
		"whole float":   `4.0`,
		"exponent":      `4e0`,
		"string":        `"4"`,
		"boolean":       `true`,
		"array":         `[4]`,
		"object":        `{"n":4}`,
		"leading zeros": `04`,
	} {
		t.Run(name, func(t *testing.T) {
			h, mem := newServer(t)
			expectBadRequest(t, postRaw(t, h, feedbackPath, `{"session_id":"`+sid+`","helpfulness":`+raw+`}`))
			assertNothingStored(t, mem)
		})
	}
}

func TestFeedbackHelpfulnessIsRequired(t *testing.T) {
	h, mem := newServer(t)
	expectRejectedAndNothingStored(t, h, mem, without(validFeedback(t), "helpfulness"))
}

// --- session id ---

func TestFeedbackSessionIDMustBeAUUID(t *testing.T) {
	for name, body := range map[string]obj{
		"missing":     without(validFeedback(t), "session_id"),
		"not a uuid":  with(validFeedback(t), "session_id", "not-a-uuid"),
		"empty":       with(validFeedback(t), "session_id", ""),
		"number":      with(validFeedback(t), "session_id", 123),
		"no hyphens":  with(validFeedback(t), "session_id", strings.ReplaceAll(newUUID(t), "-", "")),
		"with suffix": with(validFeedback(t), "session_id", newUUID(t)+"x"),
	} {
		t.Run(name, func(t *testing.T) {
			h, mem := newServer(t)
			expectRejectedAndNothingStored(t, h, mem, body)
		})
	}
}

// --- requested_topic ---

func TestFeedbackApprovedTopicsAccepted(t *testing.T) {
	for _, topic := range approvedTopics {
		t.Run(topic, func(t *testing.T) {
			h, mem := newServer(t)
			expectStatus(t, postJSON(t, h, feedbackPath, with(validFeedback(t), "requested_topic", topic)), http.StatusCreated)
			if got := mem.Feedback(); len(got) != 1 || got[0].RequestedTopic == nil || *got[0].RequestedTopic != topic {
				t.Fatalf("topic %q stored as %+v", topic, got)
			}
		})
	}
}

func TestFeedbackUnknownTopicRejected(t *testing.T) {
	for _, topic := range []any{
		"doubly-linked-lists", "other", "Linked lists", "LINKED-LISTS", "linked-lists ", "", "graphs", 7, true, []string{"big-o"},
	} {
		h, mem := newServer(t)
		expectRejectedAndNothingStored(t, h, mem, with(validFeedback(t), "requested_topic", topic))
	}
}

// --- comments ---

func TestFeedbackCommentsMaxLengthCountsCharacters(t *testing.T) {
	// The limit is 2000 characters (the column's char_length check), not bytes.
	for name, unit := range map[string]string{"ascii": "a", "two-byte": "é", "four-byte emoji": "🙂"} {
		t.Run(name, func(t *testing.T) {
			h, mem := newServer(t)
			at := strings.Repeat(unit, 2000)
			expectStatus(t, postJSON(t, h, feedbackPath, with(validFeedback(t), "comments", at)), http.StatusCreated)
			if got := mem.Feedback(); len(got) != 1 || got[0].Comments == nil || *got[0].Comments != at {
				t.Fatalf("2000-character comment was not stored intact")
			}
			expectRejectedAndNothingStored(t, newServerOnly(t), store.NewMemory(), with(validFeedback(t), "comments", at+unit))
		})
	}
}

func newServerOnly(t *testing.T) http.Handler { h, _ := newServer(t); return h }

func TestFeedbackCommentsOverMaxRejectedWithoutStoring(t *testing.T) {
	h, mem := newServer(t)
	expectRejectedAndNothingStored(t, h, mem, with(validFeedback(t), "comments", strings.Repeat("a", 2001)))
}

func TestFeedbackCommentsMustBeAString(t *testing.T) {
	for _, v := range []any{5, true, []string{"x"}, obj{"a": "b"}} {
		h, mem := newServer(t)
		expectRejectedAndNothingStored(t, h, mem, with(validFeedback(t), "comments", v))
	}
}

func TestFeedbackCommentsWithNULCharacterRejected(t *testing.T) {
	// PostgreSQL text cannot hold U+0000; it must be a 400, not a database 500.
	h, mem := newServer(t)
	expectRejectedAndNothingStored(t, h, mem, with(validFeedback(t), "comments", "bad\u0000comment"))
}

func TestFeedbackEmptyCommentsStoredAsAbsent(t *testing.T) {
	h, mem := newServer(t)
	expectStatus(t, postJSON(t, h, feedbackPath, with(validFeedback(t), "comments", "")), http.StatusCreated)
	if got := mem.Feedback(); len(got) != 1 || got[0].Comments != nil {
		t.Fatalf("empty comments stored as %+v, want NULL", got)
	}
}

func TestFeedbackCommentsStoredVerbatim(t *testing.T) {
	// No server-side rewriting; the text is data and is only ever bound as a parameter.
	h, mem := newServer(t)
	text := "  'quotes'; drop table feedback; -- \n\t<b>tags</b> 日本語  "
	expectStatus(t, postJSON(t, h, feedbackPath, with(validFeedback(t), "comments", text)), http.StatusCreated)
	if got := mem.Feedback(); len(got) != 1 || got[0].Comments == nil || *got[0].Comments != text {
		t.Fatalf("comments = %+v, want verbatim %q", got, text)
	}
}

// --- shared validation integration ---

func TestFeedbackMalformedJSONRejected(t *testing.T) {
	for name, raw := range map[string]string{
		"truncated":      `{"session_id":`,
		"not json":       `hello`,
		"array":          `[]`,
		"empty":          ``,
		"trailing comma": `{"session_id":"` + newUUID(t) + `","helpfulness":3,}`,
	} {
		t.Run(name, func(t *testing.T) {
			h, mem := newServer(t)
			rec := postRaw(t, h, feedbackPath, raw)
			expectBadRequest(t, rec)
			assertNothingStored(t, mem)
		})
	}
}

func TestFeedbackUnknownFieldsRejected(t *testing.T) {
	h, mem := newServer(t)
	expectRejectedAndNothingStored(t, h, mem, with(validFeedback(t), "rating", 5))
}

func TestFeedbackPIILikeFieldsRejectedAsUnknown(t *testing.T) {
	for _, field := range []string{"email", "name", "student_id", "ip_address", "user_agent", "ip", "course_section", "module_id", "exercise_id"} {
		t.Run(field, func(t *testing.T) {
			h, mem := newServer(t)
			rec := postJSON(t, h, feedbackPath, with(validFeedback(t), field, "value"))
			expectBadRequest(t, rec)
			if !strings.Contains(rec.Body.String(), field) {
				t.Fatalf("error %q should name the rejected field %q", rec.Body.String(), field)
			}
			assertNothingStored(t, mem)
		})
	}
}

func TestFeedbackExplicitNullRejectedForEveryField(t *testing.T) {
	full := with(validFeedback(t), "requested_topic", "stacks", "comments", "ok")
	for field := range full {
		t.Run(field, func(t *testing.T) {
			h, mem := newServer(t)
			expectRejectedAndNothingStored(t, h, mem, with(full, field, nil))
		})
	}
}

func TestFeedbackOversizedBodyIs413(t *testing.T) {
	h, mem := newServer(t)
	rec := postRaw(t, h, feedbackPath, padInside(t, validFeedback(t), 70<<10))
	expectStatus(t, rec, http.StatusRequestEntityTooLarge)
	expectErrorShape(t, rec)
	assertNothingStored(t, mem)
}

func TestFeedbackWrongMethodRejected(t *testing.T) {
	h, _ := newServer(t)
	for _, m := range []string{http.MethodGet, http.MethodPut, http.MethodDelete, http.MethodPatch} {
		rec := do(t, h, m, feedbackPath, nil)
		expectStatus(t, rec, http.StatusMethodNotAllowed)
		expectErrorShape(t, rec)
		if allow := rec.Header().Get("Allow"); !strings.Contains(allow, "POST") {
			t.Fatalf("%s: Allow = %q, want POST", m, allow)
		}
	}
}

// --- privacy ---

func TestFeedbackPIIHeadersAreNotPersisted(t *testing.T) {
	h, mem := newServer(t)
	body := with(validFeedback(t), "requested_topic", "big-o", "comments", "fine")
	headers := []string{"X-Forwarded-For", "203.0.113.7", "X-Real-IP", "203.0.113.7", "Forwarded", "for=203.0.113.7", "User-Agent", "Mozilla/5.0 (iPhone)"}
	expectStatus(t, do(t, h, http.MethodPost, feedbackPath, mustJSON(t, body), headers...), http.StatusCreated)

	want := []store.Feedback{{SessionID: body["session_id"].(string), Helpfulness: 4, RequestedTopic: strp("big-o"), Comments: strp("fine")}}
	if got := mem.Feedback(); !reflect.DeepEqual(got, want) {
		t.Fatalf("feedback = %+v, want %+v", got, want)
	}
	stored := string(mustJSON(t, mem.Feedback())) + string(mustJSON(t, mem.Sessions()))
	if strings.Contains(stored, "203.0.113.7") || strings.Contains(stored, "Mozilla") {
		t.Fatalf("request metadata was stored: %s", stored)
	}
}

// --- store failure ---

type feedbackFailingStore struct{ store.Store }

func (feedbackFailingStore) InsertFeedback(context.Context, store.Feedback) error { return errDown }

func TestFeedbackStoreFailureIsGeneric500(t *testing.T) {
	h := newServerWith(feedbackFailingStore{store.NewMemory()})
	rec := postJSON(t, h, feedbackPath, validFeedback(t))
	expectStatus(t, rec, http.StatusInternalServerError)
	expectErrorShape(t, rec)
	expectNoInternalDetails(t, rec)
	if got := strings.TrimSpace(rec.Body.String()); got != `{"error":"internal error"}` {
		t.Fatalf("body = %s, want the generic envelope", got)
	}
}

type feedbackStallingStore struct {
	*store.Memory
	mu  sync.Mutex
	err error
}

func (s *feedbackStallingStore) InsertFeedback(ctx context.Context, _ store.Feedback) error {
	<-ctx.Done()
	s.mu.Lock()
	s.err = ctx.Err()
	s.mu.Unlock()
	return ctx.Err()
}

func TestFeedbackStalledStoreTimesOutWithGeneric500(t *testing.T) {
	st := &feedbackStallingStore{Memory: store.NewMemory()}
	h := api.NewRouter(st, api.Config{AllowedOrigins: []string{allowedOrigin}, StoreTimeout: 50 * time.Millisecond})
	start := time.Now()
	rec := postJSON(t, h, feedbackPath, validFeedback(t))
	if time.Since(start) > 2*time.Second {
		t.Fatal("handler held open; the store timeout did not apply to feedback")
	}
	expectStatus(t, rec, http.StatusInternalServerError)
	if got := strings.TrimSpace(rec.Body.String()); got != `{"error":"internal error"}` {
		t.Fatalf("body = %s, want the generic envelope", got)
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	if st.err != context.DeadlineExceeded {
		t.Fatalf("store context ended with %v, want deadline exceeded", st.err)
	}
}

// --- CORS (inherited) ---

func TestFeedbackCORSInherited(t *testing.T) {
	h, _ := newServer(t)

	rec := do(t, h, http.MethodPost, feedbackPath, mustJSON(t, validFeedback(t)), "Origin", allowedOrigin)
	expectStatus(t, rec, http.StatusCreated)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}

	rec = do(t, h, http.MethodPost, feedbackPath, mustJSON(t, validFeedback(t)), "Origin", "https://evil.example")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q for a non-allowlisted origin, want none", got)
	}

	rec = do(t, h, http.MethodOptions, feedbackPath, nil,
		"Origin", allowedOrigin, "Access-Control-Request-Method", "POST", "Access-Control-Request-Headers", "content-type")
	expectStatus(t, rec, http.StatusNoContent)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("preflight Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}

	rec = do(t, h, http.MethodOptions, feedbackPath, nil, "Origin", "https://evil.example", "Access-Control-Request-Method", "POST")
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("disallowed preflight carries Access-Control-Allow-Origin %q", got)
	}
}

func TestFeedbackCancellationReachesTheStore(t *testing.T) {
	st := &feedbackStallingStore{Memory: store.NewMemory()}
	h := api.NewRouter(st, api.Config{AllowedOrigins: []string{allowedOrigin}, StoreTimeout: time.Hour})
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodPost, feedbackPath, strings.NewReader(string(mustJSON(t, validFeedback(t))))).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	done := make(chan struct{})
	go func() { h.ServeHTTP(httptest.NewRecorder(), req); close(done) }()
	time.Sleep(20 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return after the request was cancelled")
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	if st.err != context.Canceled {
		t.Fatalf("store context ended with %v, want cancellation", st.err)
	}
}
