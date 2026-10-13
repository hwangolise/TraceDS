package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres is the pgx implementation of Store (ARCHITECTURE §9.1).
//
// M7A stub: every method returns "not implemented".
type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

func (p *Postgres) CreateSession(ctx context.Context, s Session) (bool, error) {
	return false, errNotImplemented
}

func (p *Postgres) InsertEvents(ctx context.Context, sessionID string, events []Event) (int, error) {
	return 0, errNotImplemented
}

func (p *Postgres) InsertFeedback(ctx context.Context, f Feedback) error {
	return errNotImplemented
}

func (p *Postgres) Ping(ctx context.Context) error { return errNotImplemented }
