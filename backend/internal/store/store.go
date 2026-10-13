// Package store persists anonymous sessions, events, and feedback
// (docs/ARCHITECTURE.md §9.1, §9.3).
//
// M7A: types and the Store interface only. Implementations are stubs.
package store

import (
	"context"
	"time"
)

// Session is a row in `sessions`. Optional columns are nil when absent.
type Session struct {
	ID         string
	AppVersion *string
	Viewport   *string
}

// Event is a row in `events`. ID is the client-generated event_id
// (idempotency key). Optional columns are nil when absent.
type Event struct {
	ID              string
	SessionID       string
	RunID           *string
	EventType       string
	ModuleID        *string
	ExerciseID      *string
	StepID          *string
	ChoiceID        *string
	Correct         *bool
	AttemptNumber   *int
	ConceptID       *string
	MisconceptionID *string
	ClientTS        *time.Time
}

// Feedback is a row in `feedback` (M8).
type Feedback struct {
	SessionID      string
	Helpfulness    int
	RequestedTopic *string
	Comments       *string
}

// Store is the only interface abstraction in the backend (ARCHITECTURE §9.1).
type Store interface {
	// CreateSession upserts a session. On conflict it fills AppVersion and
	// Viewport only where the stored value is still null; it never overwrites
	// a known value or changes created_at. created is false when it already existed.
	CreateSession(ctx context.Context, s Session) (created bool, err error)
	// InsertEvents upserts the session (no metadata), then inserts the events
	// in slice order, ignoring event ids that already exist. It returns the
	// number of new rows.
	InsertEvents(ctx context.Context, sessionID string, events []Event) (inserted int, err error)
	InsertFeedback(ctx context.Context, f Feedback) error
	Ping(ctx context.Context) error
}
