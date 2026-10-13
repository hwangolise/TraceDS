package api

import (
	"net/http"
)

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	db := "ok"
	ctx, cancel := s.storeCtx(r)
	defer cancel()
	if err := s.st.Ping(ctx); err != nil {
		db = "unavailable"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "database": db})
}

func (s *server) createSession(w http.ResponseWriter, r *http.Request) {
	sess, err := decodeSession(w, r)
	if err != nil {
		writeDecodeError(w, err)
		return
	}
	ctx, cancel := s.storeCtx(r)
	defer cancel()
	created, err := s.st.CreateSession(ctx, sess)
	if err != nil {
		storeFailure(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, map[string]string{"session_id": sess.ID})
}

func (s *server) postEvents(w http.ResponseWriter, r *http.Request) {
	sessionID, events, err := decodeEvents(w, r)
	if err != nil {
		writeDecodeError(w, err)
		return
	}
	ctx, cancel := s.storeCtx(r)
	defer cancel()
	n, err := s.st.InsertEvents(ctx, sessionID, events)
	if err != nil {
		storeFailure(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]int{"accepted": n})
}
