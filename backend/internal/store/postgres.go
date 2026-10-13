package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres is the pgx implementation of Store (ARCHITECTURE §9.1).
type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

const upsertSessionSQL = `
insert into sessions (id, app_version, viewport) values ($1, $2, $3)
on conflict (id) do update set
  app_version = coalesce(sessions.app_version, excluded.app_version),
  viewport    = coalesce(sessions.viewport, excluded.viewport)
returning (xmax = 0)`

func (p *Postgres) CreateSession(ctx context.Context, s Session) (bool, error) {
	var created bool
	err := p.pool.QueryRow(ctx, upsertSessionSQL, s.ID, s.AppVersion, s.Viewport).Scan(&created)
	return created, err
}

const insertEventSQL = `
insert into events (id, session_id, run_id, event_type, module_id, exercise_id, step_id,
                    choice_id, correct, attempt_number, concept_id, misconception_id, client_ts)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
on conflict (id) do nothing`

// InsertEvents runs in one transaction: the session is created if missing,
// then events are inserted in slice order (so `seq` follows batch order).
func (p *Postgres) InsertEvents(ctx context.Context, sessionID string, events []Event) (int, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `insert into sessions (id) values ($1) on conflict (id) do nothing`, sessionID); err != nil {
		return 0, err
	}
	inserted := 0
	for _, e := range events {
		tag, err := tx.Exec(ctx, insertEventSQL, e.ID, sessionID, e.RunID, e.EventType, e.ModuleID,
			e.ExerciseID, e.StepID, e.ChoiceID, e.Correct, e.AttemptNumber, e.ConceptID,
			e.MisconceptionID, e.ClientTS)
		if err != nil {
			return 0, err
		}
		inserted += int(tag.RowsAffected())
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return inserted, nil
}

// InsertFeedback exists so the Store interface is complete; the HTTP endpoint
// and its behaviour belong to M8.
func (p *Postgres) InsertFeedback(ctx context.Context, f Feedback) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `insert into sessions (id) values ($1) on conflict (id) do nothing`, f.SessionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `insert into feedback (session_id, helpfulness, requested_topic, comments) values ($1,$2,$3,$4)`,
		f.SessionID, f.Helpfulness, f.RequestedTopic, f.Comments); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *Postgres) Ping(ctx context.Context) error {
	var one int
	if err := p.pool.QueryRow(ctx, `select 1`).Scan(&one); err != nil {
		return err
	}
	if one != 1 {
		return errors.New("unexpected ping result")
	}
	return nil
}
