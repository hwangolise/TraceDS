package api_test

import (
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"traceds/backend/internal/store"
)

// B8 — no PII required or accepted (ARCHITECTURE §9.2, §10; ANALYTICS §1).

func TestB8EveryEndpointSucceedsWithOnlyDocumentedFields(t *testing.T) {
	h, mem := newServer(t)
	session := newUUID(t)

	expectStatus(t, do(t, h, http.MethodGet, "/api/v1/health", nil), http.StatusOK)
	expectStatus(t, postJSON(t, h, "/api/v1/sessions", obj{"session_id": session}), http.StatusCreated)
	expectStatus(t, postJSON(t, h, "/api/v1/events", batch(session, minimalEvent(t, "session_started"))), http.StatusAccepted)

	if got := mem.Sessions(); len(got) != 1 || got[0].ID != session {
		t.Fatalf("sessions = %+v", got)
	}
	if got := mem.Events(); len(got) != 1 {
		t.Fatalf("events = %+v", got)
	}
}

func TestB8PIIHeadersAreNotPersisted(t *testing.T) {
	// The client IP and user agent arrive with every request. They must not reach storage.
	h, mem := newServer(t)
	session := newUUID(t)
	headers := []string{"X-Forwarded-For", "203.0.113.7", "X-Real-IP", "203.0.113.7", "User-Agent", "Mozilla/5.0 (iPhone)"}
	expectStatus(t, do(t, h, http.MethodPost, "/api/v1/sessions", mustJSON(t, obj{"session_id": session}), headers...), http.StatusCreated)
	expectStatus(t, do(t, h, http.MethodPost, "/api/v1/events", mustJSON(t, batch(session, minimalEvent(t, "session_started"))), headers...), http.StatusAccepted)

	want := []store.Session{{ID: session}}
	if got := mem.Sessions(); !reflect.DeepEqual(got, want) {
		t.Fatalf("sessions = %+v, want %+v", got, want)
	}
	for _, e := range mem.Events() {
		if strings.Contains(dump(e), "203.0.113.7") || strings.Contains(dump(e), "Mozilla") {
			t.Fatalf("event stored request metadata: %s", dump(e))
		}
	}
}

// B11 — TraceDS code never reads or logs client IP addresses (decision Q8).
// Static scan of all non-test Go source in backend/.

func TestB11NoClientIPAccessInSource(t *testing.T) {
	forbidden := regexp.MustCompile(`(?i)(RemoteAddr|X-Forwarded-For|X-Real-IP|"Forwarded"|True-Client-IP|CF-Connecting-IP)`)
	root := filepath.Join("..", "..")
	scanned := 0
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		scanned++
		if m := forbidden.FindString(string(src)); m != "" {
			t.Errorf("%s references %q; TraceDS must not read client IPs (ARCHITECTURE §10)", path, m)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if scanned == 0 {
		t.Fatal("scanned no Go source files; the scan is not looking in backend/")
	}
}
