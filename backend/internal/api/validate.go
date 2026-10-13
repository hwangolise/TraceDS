package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"traceds/backend/internal/store"
)

// validationError is a client mistake; its message is safe to return.
type validationError string

func (e validationError) Error() string { return string(e) }

func bad(format string, a ...any) validationError { return validationError(fmt.Sprintf(format, a...)) }

// errTooLarge marks a body over maxBodyBytes (413).
var errTooLarge = errors.New("request body too large")

func writeDecodeError(w http.ResponseWriter, err error) {
	var ve validationError
	switch {
	case errors.Is(err, errTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
	case errors.As(err, &ve):
		writeError(w, http.StatusBadRequest, string(ve))
	default:
		storeFailure(w, err)
	}
}

var (
	uuidRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	idRE   = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

// readObject reads the (size-limited) body as a single JSON object and splits
// it into raw members. Unknown keys are rejected against allowed, and an
// explicit null is rejected for every member (ANALYTICS §3 null policy).
func readObject(w http.ResponseWriter, r *http.Request) (map[string]json.RawMessage, error) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return nil, errTooLarge
		}
		return nil, bad("could not read request body")
	}
	if len(bytes.TrimSpace(body)) == 0 || bytes.TrimSpace(body)[0] != '{' {
		return nil, bad("request body must be a JSON object")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(body, &obj); err != nil {
		return nil, bad("malformed JSON")
	}
	return obj, nil
}

func checkMembers(obj map[string]json.RawMessage, allowed map[string]bool) error {
	for k, v := range obj {
		if !allowed[k] {
			return bad("unknown field %q", k)
		}
		if bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			return bad("field %q must not be null", k)
		}
	}
	return nil
}

func asString(obj map[string]json.RawMessage, key string) (string, bool, error) {
	raw, ok := obj[key]
	if !ok {
		return "", false, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", true, bad("field %q must be a string", key)
	}
	return s, true, nil
}

func asUUID(obj map[string]json.RawMessage, key string, required bool) (*string, error) {
	s, ok, err := asString(obj, key)
	if err != nil {
		return nil, err
	}
	if !ok {
		if required {
			return nil, bad("field %q is required", key)
		}
		return nil, nil
	}
	if !uuidRE.MatchString(s) {
		return nil, bad("field %q must be a UUID", key)
	}
	s = lower(s)
	return &s, nil
}

func lower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

// --- sessions ---

var sessionFields = map[string]bool{"session_id": true, "app_version": true, "viewport": true}

func decodeSession(w http.ResponseWriter, r *http.Request) (store.Session, error) {
	var out store.Session
	obj, err := readObject(w, r)
	if err != nil {
		return out, err
	}
	if err := checkMembers(obj, sessionFields); err != nil {
		return out, err
	}
	id, err := asUUID(obj, "session_id", true)
	if err != nil {
		return out, err
	}
	out.ID = *id
	if v, ok, err := asString(obj, "app_version"); err != nil {
		return out, err
	} else if ok {
		out.AppVersion = &v
	}
	if v, ok, err := asString(obj, "viewport"); err != nil {
		return out, err
	} else if ok {
		if v != "narrow" && v != "wide" {
			return out, bad(`field "viewport" must be "narrow" or "wide"`)
		}
		out.Viewport = &v
	}
	return out, nil
}

// --- events ---

const maxBatch = 50

// fieldRule: R = required, O = optional; any field not listed must be absent.
type fieldRule struct{ required, optional []string }

// eventRules transcribes the ANALYTICS §3 catalog. answer_submitted's
// misconception_id is additionally required when correct is false.
var eventRules = map[string]fieldRule{
	"session_started":    {},
	"module_selected":    {required: []string{"module_id"}},
	"exercise_started":   {required: []string{"module_id", "exercise_id", "run_id"}},
	"answer_submitted":   {required: []string{"module_id", "exercise_id", "run_id", "step_id", "choice_id", "correct", "attempt_number", "concept_id"}, optional: []string{"misconception_id"}},
	"hint_shown":         {required: []string{"module_id", "exercise_id", "run_id", "step_id", "choice_id", "attempt_number", "concept_id", "misconception_id"}},
	"exercise_completed": {required: []string{"module_id", "exercise_id", "run_id"}},
	"survey_submitted":   {optional: []string{"module_id", "exercise_id"}},
}

var eventKnownFields = map[string]bool{
	"event_id": true, "event_type": true, "client_ts": true,
	"module_id": true, "exercise_id": true, "run_id": true, "step_id": true, "choice_id": true,
	"correct": true, "attempt_number": true, "concept_id": true, "misconception_id": true,
}

func decodeEvents(w http.ResponseWriter, r *http.Request) (string, []store.Event, error) {
	obj, err := readObject(w, r)
	if err != nil {
		return "", nil, err
	}
	if err := checkMembers(obj, map[string]bool{"session_id": true, "events": true}); err != nil {
		return "", nil, err
	}
	sid, err := asUUID(obj, "session_id", true)
	if err != nil {
		return "", nil, err
	}
	rawEvents, ok := obj["events"]
	if !ok {
		return "", nil, bad(`field "events" is required`)
	}
	var list []json.RawMessage
	if err := json.Unmarshal(rawEvents, &list); err != nil {
		return "", nil, bad(`field "events" must be an array`)
	}
	if len(list) < 1 || len(list) > maxBatch {
		return "", nil, bad("a batch must contain 1 to %d events", maxBatch)
	}
	events := make([]store.Event, 0, len(list))
	for i, raw := range list {
		ev, err := decodeEvent(raw, *sid)
		if err != nil {
			return "", nil, bad("event %d: %s", i, err)
		}
		events = append(events, ev)
	}
	return *sid, events, nil
}

func decodeEvent(raw json.RawMessage, sessionID string) (store.Event, error) {
	ev := store.Event{SessionID: sessionID}
	if t := bytes.TrimSpace(raw); len(t) == 0 || t[0] != '{' {
		return ev, errors.New("must be an object")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return ev, errors.New("malformed event")
	}
	if err := checkMembers(obj, eventKnownFields); err != nil {
		return ev, err
	}

	id, err := asUUID(obj, "event_id", true)
	if err != nil {
		return ev, err
	}
	ev.ID = *id

	typ, ok, err := asString(obj, "event_type")
	if err != nil {
		return ev, err
	}
	rule, known := eventRules[typ]
	if !ok || !known {
		return ev, errors.New(`field "event_type" is missing or unsupported`)
	}
	ev.EventType = typ

	tsStr, ok, err := asString(obj, "client_ts")
	if err != nil {
		return ev, err
	}
	if !ok {
		return ev, errors.New(`field "client_ts" is required`)
	}
	ts, perr := time.Parse(time.RFC3339Nano, tsStr)
	if perr != nil {
		return ev, errors.New(`field "client_ts" must be an RFC 3339 timestamp`)
	}
	ev.ClientTS = &ts

	// R/O/absent matrix.
	allowed := map[string]bool{}
	for _, f := range rule.required {
		allowed[f] = true
		if _, present := obj[f]; !present {
			return ev, bad("field %q is required for %s", f, typ)
		}
	}
	for _, f := range rule.optional {
		allowed[f] = true
	}
	for f := range obj {
		if f == "event_id" || f == "event_type" || f == "client_ts" {
			continue
		}
		if !allowed[f] {
			return ev, bad("field %q is not allowed for %s", f, typ)
		}
	}

	if ev.RunID, err = asUUID(obj, "run_id", false); err != nil {
		return ev, err
	}
	for key, dst := range map[string]**string{
		"module_id": &ev.ModuleID, "exercise_id": &ev.ExerciseID, "step_id": &ev.StepID,
		"choice_id": &ev.ChoiceID, "concept_id": &ev.ConceptID, "misconception_id": &ev.MisconceptionID,
	} {
		s, present, err := asString(obj, key)
		if err != nil {
			return ev, err
		}
		if !present {
			continue
		}
		if !idRE.MatchString(s) {
			return ev, bad("field %q has an invalid id", key)
		}
		v := s
		*dst = &v
	}
	if raw, present := obj["correct"]; present {
		switch string(bytes.TrimSpace(raw)) {
		case "true":
			ev.Correct = boolPtr(true)
		case "false":
			ev.Correct = boolPtr(false)
		default:
			return ev, errors.New(`field "correct" must be a boolean`)
		}
	}
	if raw, present := obj["attempt_number"]; present {
		n, err := strconv.Atoi(string(bytes.TrimSpace(raw)))
		if err != nil || n < 1 || n > 10 {
			return ev, errors.New(`field "attempt_number" must be an integer from 1 to 10`)
		}
		ev.AttemptNumber = &n
	}
	if typ == "answer_submitted" && ev.Correct != nil && !*ev.Correct && ev.MisconceptionID == nil {
		return ev, errors.New(`field "misconception_id" is required for an incorrect answer`)
	}
	return ev, nil
}

func boolPtr(b bool) *bool { return &b }
