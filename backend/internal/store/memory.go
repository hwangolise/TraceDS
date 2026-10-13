package store

import (
	"context"
	"errors"
)

// errNotImplemented is returned (rather than panicking) so that one red test
// does not abort the whole `go test` binary during the M7A red run.
var errNotImplemented = errors.New("not implemented")

// Memory is the in-memory Store used by handler tests (ARCHITECTURE §9.1).
//
// M7A stub: every method fails or returns nothing.
type Memory struct{}

func NewMemory() *Memory { return &Memory{} }

func (m *Memory) CreateSession(ctx context.Context, s Session) (bool, error) {
	return false, errNotImplemented
}

func (m *Memory) InsertEvents(ctx context.Context, sessionID string, events []Event) (int, error) {
	return 0, errNotImplemented
}

func (m *Memory) InsertFeedback(ctx context.Context, f Feedback) error {
	return errNotImplemented
}

func (m *Memory) Ping(ctx context.Context) error { return errNotImplemented }

// Sessions returns a snapshot of the stored sessions (test inspection).
func (m *Memory) Sessions() []Session { return nil }

// Events returns a snapshot of the stored events in insertion order (test inspection).
func (m *Memory) Events() []Event { return nil }
