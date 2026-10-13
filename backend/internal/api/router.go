// Package api is the HTTP layer: routing, JSON decoding, validation, CORS
// (docs/ARCHITECTURE.md §9.1–9.2).
package api

import (
	"net/http"

	"traceds/backend/internal/store"
)

// Config holds the HTTP layer's settings.
type Config struct {
	// AllowedOrigins is the CORS allowlist (from ALLOWED_ORIGINS).
	AllowedOrigins []string
}

// NewRouter returns the API handler.
//
// M7A stub: every request gets 501.
func NewRouter(st store.Store, cfg Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not implemented", http.StatusNotImplemented)
	})
}
