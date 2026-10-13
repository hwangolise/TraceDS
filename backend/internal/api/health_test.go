package api_test

import (
	"net/http"
	"reflect"
	"testing"
)

// B1 — GET /api/v1/health → 200 {"status":"ok","database":"ok"|"unavailable"}
// (ARCHITECTURE §9.2). Always 200 while the process is up.

func TestB1HealthOK(t *testing.T) {
	h, _ := newServer(t)
	rec := do(t, h, http.MethodGet, "/api/v1/health", nil)
	expectStatus(t, rec, http.StatusOK)
	expectJSONContentType(t, rec)
	want := obj{"status": "ok", "database": "ok"}
	if got := decodeObject(t, rec); !reflect.DeepEqual(got, want) {
		t.Fatalf("body = %v, want %v", got, want)
	}
}

func TestB1HealthDatabaseUnavailableStill200(t *testing.T) {
	_, mem := newServer(t)
	h := newServerWith(failingStore{Store: mem, failPing: true})
	rec := do(t, h, http.MethodGet, "/api/v1/health", nil)
	expectStatus(t, rec, http.StatusOK)
	expectJSONContentType(t, rec)
	want := obj{"status": "ok", "database": "unavailable"}
	if got := decodeObject(t, rec); !reflect.DeepEqual(got, want) {
		t.Fatalf("body = %v, want %v", got, want)
	}
}
