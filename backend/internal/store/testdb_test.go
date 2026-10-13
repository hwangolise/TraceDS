//go:build integration

package store_test

// Integration-test harness (docs/TESTING.md §1): a real PostgreSQL reached
// through TEST_DATABASE_URL. Each test gets its own empty schema with
// migrations/0001_init.sql applied, and the schema is dropped afterwards, so
// tests never see each other's rows or touch the public schema.

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type testDB struct {
	Pool   *pgxpool.Pool
	Schema string
}

func migrationSQL(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "migrations", "0001_init.sql"))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	return string(b)
}

// emptyDB returns a pool whose search_path is a fresh, empty schema.
func emptyDB(t *testing.T) testDB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Fatal("TEST_DATABASE_URL is not set; integration tests need a PostgreSQL database")
	}
	ctx := context.Background()

	var b [6]byte
	if _, err := rand.Read(b[:]); err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("m7test_%x", b)

	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if _, err := admin.Exec(ctx, "create schema "+schema); err != nil {
		admin.Close()
		t.Fatalf("create schema: %v", err)
	}

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(context.Background(), "drop schema "+schema+" cascade")
		admin.Close()
	})
	return testDB{Pool: pool, Schema: schema}
}

// applySQL runs a multi-statement SQL script over the simple protocol, as psql -f does.
func applySQL(ctx context.Context, pool *pgxpool.Pool, sql string) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	_, err = conn.Conn().PgConn().Exec(ctx, sql).ReadAll()
	return err
}

// migratedDB returns an isolated schema with 0001_init.sql applied.
func migratedDB(t *testing.T) testDB {
	t.Helper()
	db := emptyDB(t)
	if err := applySQL(context.Background(), db.Pool, migrationSQL(t)); err != nil {
		t.Fatalf("apply 0001_init.sql: %v", err)
	}
	return db
}

func (db testDB) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	if _, err := db.Pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("exec %q: %v", sql, err)
	}
}

// sqlState returns the SQLSTATE of err, or "" when err is nil or not a server error.
func sqlState(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

func newUUID(t *testing.T) string {
	t.Helper()
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		t.Fatal(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
