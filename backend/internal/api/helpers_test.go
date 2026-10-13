package api_test

// Shared helpers for the HTTP contract tests (docs/TESTING.md §M7, B1–B12).
// Request bodies are handwritten JSON-shaped maps taken from
// docs/ARCHITECTURE.md §9.2 and docs/ANALYTICS.md §3. They are not produced by
// production code.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"traceds/backend/internal/api"
	"traceds/backend/internal/store"
)

const (
	allowedOrigin = "https://traceds.vercel.app"
	devOrigin     = "http://localhost:5173"
)

// newServer returns the router over a fresh in-memory store.
func newServer(t *testing.T) (http.Handler, *store.Memory) {
	t.Helper()
	mem := store.NewMemory()
	return api.NewRouter(mem, api.Config{AllowedOrigins: []string{allowedOrigin, devOrigin}}), mem
}

// newUUID returns a random RFC 4122 version-4 UUID in canonical lowercase form.
func newUUID(t *testing.T) string {
	t.Helper()
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		t.Fatal(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

type obj = map[string]any

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func do(t *testing.T, h http.Handler, method, path string, body []byte, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	var r io.Reader
	if body != nil {
		r = bytes.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func postJSON(t *testing.T, h http.Handler, path string, v any) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, h, http.MethodPost, path, mustJSON(t, v))
}

func postRaw(t *testing.T, h http.Handler, path, raw string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, h, http.MethodPost, path, []byte(raw))
}

// decodeObject decodes a JSON object response body.
func decodeObject(t *testing.T, rec *httptest.ResponseRecorder) obj {
	t.Helper()
	var out obj
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("response body is not a JSON object: %v\nbody: %q", err, rec.Body.String())
	}
	return out
}

func expectStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d; body: %q", rec.Code, want, rec.Body.String())
	}
}

func expectJSONContentType(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
}

// expectErrorShape asserts the documented error body: exactly {"error": "<non-empty message>"}.
func expectErrorShape(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	expectJSONContentType(t, rec)
	body := decodeObject(t, rec)
	msg, ok := body["error"].(string)
	if !ok || msg == "" || len(body) != 1 {
		t.Fatalf(`error body = %v, want exactly {"error": "<message>"}`, body)
	}
}

// expectNoInternalDetails asserts the error message leaks nothing from the store's error (ARCHITECTURE §9.2).
func expectNoInternalDetails(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	body := rec.Body.String()
	for _, d := range internalDetails {
		if strings.Contains(body, d) {
			t.Fatalf("error body %q exposes internal detail %q", body, d)
		}
	}
}

// expectAccepted asserts the 202 body is exactly {"accepted": n} (n = new rows).
func expectAccepted(t *testing.T, rec *httptest.ResponseRecorder, n int) {
	t.Helper()
	if got, want := decodeObject(t, rec), (obj{"accepted": float64(n)}); !reflect.DeepEqual(got, want) {
		t.Fatalf("body = %v, want %v", got, want)
	}
}

func expectBadRequest(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	expectStatus(t, rec, http.StatusBadRequest)
	expectErrorShape(t, rec)
}

// failingStore wraps a Store and makes selected methods fail, to observe the
// API's behaviour when the database is unavailable.
type failingStore struct {
	store.Store
	failPing, failSessions, failEvents bool
}

// errDown mimics a driver error full of internal details that must never reach a client.
var errDown = errors.New(`pgx: failed to connect to host=db-internal.secret port=5432: SQLSTATE 08006 (select * from events)`)

// internalDetails are fragments of errDown that an API error message must not contain.
var internalDetails = []string{"pgx", "db-internal", "secret", "5432", "SQLSTATE", "select"}

func (f failingStore) Ping(ctx context.Context) error {
	if f.failPing {
		return errDown
	}
	return f.Store.Ping(ctx)
}

func (f failingStore) CreateSession(ctx context.Context, s store.Session) (bool, error) {
	if f.failSessions {
		return false, errDown
	}
	return f.Store.CreateSession(ctx, s)
}

func (f failingStore) InsertEvents(ctx context.Context, sessionID string, events []store.Event) (int, error) {
	if f.failEvents {
		return 0, errDown
	}
	return f.Store.InsertEvents(ctx, sessionID, events)
}

func newServerWith(st store.Store) http.Handler {
	return api.NewRouter(st, api.Config{AllowedOrigins: []string{allowedOrigin, devOrigin}})
}

// padInside returns a JSON object whose first member is preceded by n bytes of
// whitespace, so the decoder has to read the whole body. The body stays valid.
func padInside(t *testing.T, v obj, n int) string {
	t.Helper()
	inner := strings.TrimPrefix(string(mustJSON(t, v)), "{")
	return "{" + strings.Repeat(" ", n) + inner
}

func strp(s string) *string { return &s }
func boolp(b bool) *bool    { return &b }
func intp(i int) *int       { return &i }
