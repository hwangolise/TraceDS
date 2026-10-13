package store

import (
	"context"
	"sync"
)

// Memory is the in-memory Store used by handler tests (ARCHITECTURE §9.1).
// It mirrors the semantics of Postgres: session enrichment fills only missing
// metadata, and event ids are globally unique with the first writer winning.
type Memory struct {
	mu       sync.Mutex
	sessions []Session
	events   []Event
	feedback []Feedback
}

func NewMemory() *Memory { return &Memory{} }

func (m *Memory) sessionIndex(id string) int {
	for i := range m.sessions {
		if m.sessions[i].ID == id {
			return i
		}
	}
	return -1
}

func (m *Memory) CreateSession(ctx context.Context, s Session) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if i := m.sessionIndex(s.ID); i >= 0 {
		cur := &m.sessions[i]
		if cur.AppVersion == nil {
			cur.AppVersion = copyPtr(s.AppVersion)
		}
		if cur.Viewport == nil {
			cur.Viewport = copyPtr(s.Viewport)
		}
		return false, nil
	}
	m.sessions = append(m.sessions, Session{ID: s.ID, AppVersion: copyPtr(s.AppVersion), Viewport: copyPtr(s.Viewport)})
	return true, nil
}

func (m *Memory) InsertEvents(ctx context.Context, sessionID string, events []Event) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.sessionIndex(sessionID) < 0 {
		m.sessions = append(m.sessions, Session{ID: sessionID})
	}
	known := make(map[string]bool, len(m.events))
	for _, e := range m.events {
		known[e.ID] = true
	}
	inserted := 0
	for _, e := range events {
		if known[e.ID] {
			continue
		}
		known[e.ID] = true
		e.SessionID = sessionID
		m.events = append(m.events, e)
		inserted++
	}
	return inserted, nil
}

func (m *Memory) InsertFeedback(ctx context.Context, f Feedback) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.sessionIndex(f.SessionID) < 0 {
		m.sessions = append(m.sessions, Session{ID: f.SessionID})
	}
	m.feedback = append(m.feedback, f)
	return nil
}

func (m *Memory) Ping(ctx context.Context) error { return nil }

// Sessions returns a snapshot of the stored sessions (test inspection).
func (m *Memory) Sessions() []Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]Session(nil), m.sessions...)
}

// Events returns a snapshot of the stored events in insertion order (test inspection).
func (m *Memory) Events() []Event {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]Event(nil), m.events...)
}

func copyPtr[T any](p *T) *T {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}
