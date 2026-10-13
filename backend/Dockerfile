# TraceDS API image (docs/ARCHITECTURE.md §11): Go build → distroless static.
# Cloud Run: `gcloud run deploy traceds-api --source backend/ …` (M10). The
# server listens on $PORT (Cloud Run injects it; default 8080).

FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# Only the static binary ships: no shell, no source, tests, or migrations.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/server"]
