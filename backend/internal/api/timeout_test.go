package api_test

// Store timeout (M7C fix, ARCHITECTURE §9.2): a stalled database must end in
// the generic retryable 500 instead of holding the handler open until the
// infrastructure timeout, and client cancellation must still reach the store.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"traceds/backend/internal/api"
	"traceds/backend/internal/store"
)

// stallingStore blocks every call until its context ends, like a database that
// never answers, and records how that context ended.
type stallingStore struct {
	*store.Memory
	mu       sync.Mutex
	err      error
	deadline time.Time
	hasDL    bool
}

func (s *stallingStore) stall(ctx context.Context) error {
	dl, ok := ctx.Deadline()
	<-ctx.Done()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.err, s.deadline, s.hasDL = ctx.Err(), dl, ok
	return ctx.Err()
}

func (s *stallingStore) Ping(ctx context.Context) error { return s.stall(ctx) }
func (s *stallingStore) CreateSession(ctx context.Context, _ store.Session) (bool, error) {
	return false, s.stall(ctx)
}
func (s *stallingStore) InsertEvents(ctx context.Context, _ string, _ []store.Event) (int, error) {
	return 0, s.stall(ctx)
}

func (s *stallingStore) ended() (error, time.Time, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.err, s.deadline, s.hasDL
}

func stallingServer(timeout time.Duration) (http.Handler, *stallingStore) {
	st := &stallingStore{Memory: store.NewMemory()}
	return api.NewRouter(st, api.Config{AllowedOrigins: []string{allowedOrigin}, StoreTimeout: timeout}), st
}

func TestStoreTimeoutStalledDatabaseGivesGeneric500(t *testing.T) {
	sid := newUUID(t)
	cases := map[string]obj{
		"/api/v1/sessions": {"session_id": sid},
		"/api/v1/events": {"session_id": sid, "events": []obj{{
			"event_id": newUUID(t), "event_type": "session_started", "client_ts": "2026-10-13T10:00:00.000Z",
		}}},
	}
	for path, body := range cases {
		t.Run(path, func(t *testing.T) {
			h, st := stallingServer(50 * time.Millisecond)
			start := time.Now()
			rec := postJSON(t, h, path, body)
			if elapsed := time.Since(start); elapsed > 2*time.Second {
				t.Fatalf("handler held for %v; the store timeout did not apply", elapsed)
			}
			if rec.Code != http.StatusInternalServerError {
				t.Fatalf("status = %d, want 500 (retryable)", rec.Code)
			}
			if got := strings.TrimSpace(rec.Body.String()); got != `{"error":"internal error"}` {
				t.Fatalf("body = %s, want the generic envelope with no timeout/database details", got)
			}
			if err, _, _ := st.ended(); err != context.DeadlineExceeded {
				t.Fatalf("store context ended with %v, want deadline exceeded", err)
			}
		})
	}
}

func TestStoreTimeoutHealthStillAnswers(t *testing.T) {
	h, _ := stallingServer(50 * time.Millisecond)
	rec := do(t, h, http.MethodGet, "/api/v1/health", nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"database":"unavailable"`) {
		t.Fatalf("health = %d %s, want 200 with database unavailable", rec.Code, rec.Body.String())
	}
}

func TestStoreTimeoutPreservesRequestCancellation(t *testing.T) {
	h, st := stallingServer(time.Hour)
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sessions",
		strings.NewReader(`{"session_id":"`+newUUID(t)+`"}`)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	done := make(chan struct{})
	go func() { h.ServeHTTP(httptest.NewRecorder(), req); close(done) }()
	time.Sleep(20 * time.Millisecond)
	cancel() // the client went away
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return after the request was cancelled")
	}
	if err, _, _ := st.ended(); err != context.Canceled {
		t.Fatalf("store context ended with %v, want the request's cancellation", err)
	}
}

func TestStoreTimeoutDefaultsToAboutTenSeconds(t *testing.T) {
	h, st := stallingServer(0) // unset → default
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil).WithContext(ctx)
	before := time.Now()
	done := make(chan struct{})
	go func() { h.ServeHTTP(httptest.NewRecorder(), req); close(done) }()
	time.Sleep(20 * time.Millisecond)
	cancel()
	<-done
	_, dl, ok := st.ended()
	if !ok {
		t.Fatal("store call had no deadline")
	}
	if d := dl.Sub(before); d < 9*time.Second || d > 11*time.Second {
		t.Fatalf("store deadline %v after the request, want about 10 s", d)
	}
}
