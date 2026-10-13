// Package api is the HTTP layer: routing, JSON decoding, validation, CORS
// (docs/ARCHITECTURE.md §9.1–9.2).
package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"traceds/backend/internal/store"
)

// Config holds the HTTP layer's settings.
type Config struct {
	// AllowedOrigins is the CORS allowlist (from ALLOWED_ORIGINS).
	AllowedOrigins []string
	// StoreTimeout bounds each store (database) call. Zero means
	// DefaultStoreTimeout.
	StoreTimeout time.Duration
}

// DefaultStoreTimeout keeps a stalled database from holding a handler open
// until the infrastructure timeout. On expiry the handler returns the generic
// retryable 500 (ARCHITECTURE §9.2).
const DefaultStoreTimeout = 10 * time.Second

const (
	apiPrefix    = "/api/v1/"
	maxBodyBytes = 64 << 10 // 64 KiB
)

type server struct {
	st           store.Store
	origins      map[string]bool
	storeTimeout time.Duration
}

// storeCtx derives the context for one store call: the request context (so a
// client disconnect still cancels the query) bounded by the store timeout.
func (s *server) storeCtx(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), s.storeTimeout)
}

// NewRouter returns the API handler: exactly GET /health, POST /sessions,
// POST /events and POST /feedback under /api/v1. Everything else is 404/405.
func NewRouter(st store.Store, cfg Config) http.Handler {
	s := &server{st: st, origins: map[string]bool{}, storeTimeout: cfg.StoreTimeout}
	if s.storeTimeout <= 0 {
		s.storeTimeout = DefaultStoreTimeout
	}
	for _, o := range cfg.AllowedOrigins {
		if o = strings.TrimSpace(o); o != "" && o != "*" {
			s.origins[o] = true
		}
	}
	routes := map[string]struct {
		method  string
		handler http.HandlerFunc
	}{
		apiPrefix + "health":   {http.MethodGet, s.health},
		apiPrefix + "sessions": {http.MethodPost, s.createSession},
		apiPrefix + "events":   {http.MethodPost, s.postEvents},
		apiPrefix + "feedback": {http.MethodPost, s.postFeedback},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.cors(w, r)
		route, known := routes[r.URL.Path]
		switch {
		case !known:
			if strings.HasPrefix(r.URL.Path, apiPrefix) {
				writeError(w, http.StatusNotFound, "not found")
			} else {
				http.NotFound(w, r)
			}
		case r.Method == http.MethodOptions:
			// Preflight: 204 for every origin; CORS headers (set above) only
			// appear for allowlisted ones.
			w.WriteHeader(http.StatusNoContent)
		case r.Method != route.method:
			w.Header().Set("Allow", route.method+", OPTIONS")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		default:
			route.handler(w, r)
		}
	})
}

// cors sets CORS headers for allowlisted origins only. The allowlist is
// explicit; a wildcard is never sent.
func (s *server) cors(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("Vary", "Origin")
	origin := r.Header.Get("Origin")
	if origin == "" || !s.origins[origin] {
		return
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", origin)
	if r.Method == http.MethodOptions {
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		h.Set("Access-Control-Max-Age", "600")
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// storeFailure logs the cause server-side and gives the client a generic 500.
func storeFailure(w http.ResponseWriter, err error) {
	log.Printf("store error: %v", err)
	writeError(w, http.StatusInternalServerError, "internal error")
}
