package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// B9 — CORS with an origin allowlist (ARCHITECTURE §9.1, §9.4).

func TestB9AllowedOriginGetsACAO(t *testing.T) {
	for _, origin := range []string{allowedOrigin, devOrigin} {
		t.Run(origin, func(t *testing.T) {
			h, _ := newServer(t)
			rec := do(t, h, http.MethodPost, "/api/v1/sessions", mustJSON(t, obj{"session_id": newUUID(t)}), "Origin", origin)
			expectStatus(t, rec, http.StatusCreated)
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
				t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, origin)
			}
		})
	}
}

func TestB9OtherOriginGetsNoACAO(t *testing.T) {
	h, _ := newServer(t)
	rec := do(t, h, http.MethodPost, "/api/v1/sessions", mustJSON(t, obj{"session_id": newUUID(t)}), "Origin", "https://evil.example")
	// The request itself is not CORS-blocked server-side; the browser enforces it.
	expectStatus(t, rec, http.StatusCreated)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q for a non-allowlisted origin, want none", got)
	}
}

func TestB9PreflightAllowed(t *testing.T) {
	for _, path := range []string{"/api/v1/sessions", "/api/v1/events"} {
		t.Run(path, func(t *testing.T) {
			h, _ := newServer(t)
			rec := do(t, h, http.MethodOptions, path, nil,
				"Origin", allowedOrigin,
				"Access-Control-Request-Method", "POST",
				"Access-Control-Request-Headers", "content-type")
			expectStatus(t, rec, http.StatusNoContent)
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
				t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
			}
			if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(strings.ToUpper(got), "POST") {
				t.Fatalf("Access-Control-Allow-Methods = %q, want it to include POST", got)
			}
			if got := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(strings.ToLower(got), "content-type") {
				t.Fatalf("Access-Control-Allow-Headers = %q, want it to include Content-Type", got)
			}
		})
	}
}

func TestB9PreflightFromOtherOriginNotAllowed(t *testing.T) {
	// Final decision 6: a disallowed preflight may return 204, but never carries
	// Access-Control-Allow-Origin (and never a wildcard).
	h, _ := newServer(t)
	preflight := func(origin string) *httptest.ResponseRecorder {
		return do(t, h, http.MethodOptions, "/api/v1/events", nil,
			"Origin", origin,
			"Access-Control-Request-Method", "POST",
			"Access-Control-Request-Headers", "content-type")
	}
	// Positive control: CORS is active on this router, so the absence below is a decision, not a missing feature.
	if got := preflight(allowedOrigin).Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("control: allowlisted preflight Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
	rec := preflight("https://evil.example")
	if rec.Code >= 500 {
		t.Fatalf("disallowed preflight status = %d, want a non-error response (204 is fine)", rec.Code)
	}
	if got, ok := rec.Header()["Access-Control-Allow-Origin"]; ok {
		t.Fatalf("Access-Control-Allow-Origin = %q for a non-allowlisted origin, want the header absent", got)
	}
}

func TestB9NeverWildcard(t *testing.T) {
	h, _ := newServer(t)
	rec := do(t, h, http.MethodGet, "/api/v1/health", nil, "Origin", allowedOrigin)
	expectStatus(t, rec, http.StatusOK)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "*" {
		t.Fatalf("Access-Control-Allow-Origin is a wildcard; the allowlist must be explicit")
	}
}

// B10 — method routing; and the API surface is exactly the documented endpoints.

func TestB10WrongMethodIs405(t *testing.T) {
	cases := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/sessions"},
		{http.MethodPut, "/api/v1/sessions"},
		{http.MethodDelete, "/api/v1/sessions"},
		{http.MethodGet, "/api/v1/events"},
		{http.MethodPatch, "/api/v1/events"},
		{http.MethodPost, "/api/v1/health"},
		{http.MethodDelete, "/api/v1/health"},
	}
	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			h, _ := newServer(t)
			rec := do(t, h, c.method, c.path, nil)
			expectStatus(t, rec, http.StatusMethodNotAllowed)
			expectErrorShape(t, rec) // decision G: 405 under /api/v1 uses the envelope
		})
	}
}

func TestB10UndocumentedPathsAre404(t *testing.T) {
	// "No other endpoints exist" (ARCHITECTURE §9.2).
	cases := []struct{ method, path string }{
		{http.MethodGet, "/"},
		{http.MethodGet, "/api/v1/stats"},
		{http.MethodGet, "/api/v1/admin"},
		{http.MethodGet, "/api/v1/sessions/0f8fad5b-d9cb-469f-a165-70867728950e"},
		{http.MethodGet, "/api/v1/events/export"},
		{http.MethodPost, "/api/v1/users"},
		{http.MethodPost, "/api/v1/feedback/export"},
		{http.MethodGet, "/api/v2/health"},
		{http.MethodGet, "/health"},
	}
	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			h, _ := newServer(t)
			rec := do(t, h, c.method, c.path, nil)
			expectStatus(t, rec, http.StatusNotFound)
			if strings.HasPrefix(c.path, "/api/v1/") {
				expectErrorShape(t, rec) // decision G: 404 under /api/v1 uses the envelope
			}
		})
	}
}
