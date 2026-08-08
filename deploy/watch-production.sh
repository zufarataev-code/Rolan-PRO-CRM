#!/usr/bin/env bash
set -uo pipefail

APP_DIR="/home/runcloud/webapps/rolanpro-crm"
RUNTIME_DIR="/home/runcloud/rolanpro-runtime"
RELEASES_DIR="/home/runcloud/rolanpro-crm-releases"
STATE_FILE="/home/runcloud/.rolanpro-crm-active-release"
ENV_BACKUP="/home/runcloud/.rolanpro-crm.env.production.local"
POLL_SECONDS=15

export PATH="$RUNTIME_DIR/bin:$PATH"
export NODE_ENV="production"

child_pid=""
active_dir=""
active_sha=""

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

clear_stale_next() {
  if ! fuser -s 3000/tcp; then
    return 0
  fi

  log "Stopping stale process on port 3000"
  fuser -k -TERM 3000/tcp >/dev/null 2>&1 || true

  for _ in $(seq 1 15); do
    fuser -s 3000/tcp || return 0
    sleep 1
  done

  fuser -k -KILL 3000/tcp >/dev/null 2>&1 || true
}

stop_next() {
  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    log "Stopping Next.js process $child_pid"
    kill "$child_pid" 2>/dev/null || true

    for _ in $(seq 1 30); do
      kill -0 "$child_pid" 2>/dev/null || break
      sleep 1
    done

    kill -9 "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi

  child_pid=""
}

start_next() {
  local release_dir="$1"

  log "Starting Next.js from $release_dir"
  (
    cd "$release_dir" || exit 1
    exec ./node_modules/.bin/next start -H 0.0.0.0 -p 3000
  ) &
  child_pid=$!

  for _ in $(seq 1 60); do
    if ! kill -0 "$child_pid" 2>/dev/null; then
      wait "$child_pid" 2>/dev/null || true
      child_pid=""
      return 1
    fi

    if curl --silent --fail --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
      sleep 1
      if kill -0 "$child_pid" 2>/dev/null; then
        log "Next.js is healthy on port 3000"
        return 0
      fi
    fi

    sleep 1
  done

  stop_next
  return 1
}

wait_for_database() {
  for attempt in $(seq 1 60); do
    if pg_isready -h 127.0.0.1 -p 5433 -d rolanpro >/dev/null 2>&1; then
      return 0
    fi

    if [ "$attempt" -eq 60 ]; then
      log "PostgreSQL did not become ready in time"
      return 1
    fi

    sleep 1
  done
}

build_release() {
  local sha="$1"
  local release_dir="$RELEASES_DIR/$sha"
  local temporary_dir="$RELEASES_DIR/.${sha}.tmp"

  if [ -f "$release_dir/.next/BUILD_ID" ]; then
    log "Release $sha is already built"
    return 0
  fi

  case "$temporary_dir" in
    "$RELEASES_DIR"/*) rm -rf -- "$temporary_dir" ;;
    *) log "Refusing to clean unexpected temporary path"; return 1 ;;
  esac

  mkdir -p "$temporary_dir"
  log "Exporting Git commit $sha"
  if ! (cd "$APP_DIR" && git archive "$sha") | tar -x -C "$temporary_dir"; then
    log "Could not export Git commit $sha"
    return 1
  fi

  if ! install -m 600 "$ENV_BACKUP" "$temporary_dir/.env.production.local"; then
    log "Could not restore production environment"
    return 1
  fi

  set -a
  # shellcheck disable=SC1090
  . "$temporary_dir/.env.production.local"
  set +a

  log "Installing dependencies for $sha"
  if ! (cd "$temporary_dir" && env -u NODE_ENV npm ci); then
    log "Dependency installation failed for $sha"
    return 1
  fi

  if ! (cd "$temporary_dir" && ./node_modules/.bin/prisma generate); then
    log "Prisma client generation failed for $sha"
    return 1
  fi

  log "Building Next.js release $sha"
  if ! (cd "$temporary_dir" && NODE_OPTIONS=--max-old-space-size=768 npm run build); then
    log "Next.js build failed for $sha"
    return 1
  fi

  if ! wait_for_database; then
    return 1
  fi

  log "Applying database migrations for $sha"
  if ! (cd "$temporary_dir" && ./node_modules/.bin/prisma migrate deploy); then
    log "Database migration failed for $sha"
    return 1
  fi

  log "Seeding production reference data for $sha"
  if ! (cd "$temporary_dir" && ./node_modules/.bin/tsx prisma/seed.ts); then
    log "Reference data seed failed for $sha"
    return 1
  fi

  if ! mv "$temporary_dir" "$release_dir"; then
    log "Could not publish release $sha"
    return 1
  fi

  return 0
}

write_state() {
  local sha="$1"
  local release_dir="$2"
  local temporary_state="${STATE_FILE}.tmp"

  printf '%s\t%s\n' "$sha" "$release_dir" >"$temporary_state"
  mv "$temporary_state" "$STATE_FILE"
}

clean_old_releases() {
  local keep_dir="$1"
  local old_dir

  for old_dir in "$RELEASES_DIR"/*; do
    [ -d "$old_dir" ] || continue
    [ "$old_dir" = "$keep_dir" ] && continue

    case "$old_dir" in
      "$RELEASES_DIR"/*) rm -rf -- "$old_dir" ;;
    esac
  done
}

deploy_sha() {
  local sha="$1"
  local previous_dir="$active_dir"
  local release_dir="$RELEASES_DIR/$sha"

  if ! build_release "$sha"; then
    case "$RELEASES_DIR/.${sha}.tmp" in
      "$RELEASES_DIR"/*) rm -rf -- "$RELEASES_DIR/.${sha}.tmp" ;;
    esac
    return 1
  fi

  stop_next
  if start_next "$release_dir"; then
    active_sha="$sha"
    active_dir="$release_dir"
    write_state "$active_sha" "$active_dir"
    clean_old_releases "$active_dir"
    log "Deployment $sha completed"
    return 0
  fi

  log "Release $sha failed its health check"
  if [ -n "$previous_dir" ] && [ -f "$previous_dir/.next/BUILD_ID" ]; then
    log "Rolling back to $previous_dir"
    start_next "$previous_dir" || true
  fi
  return 1
}

trap 'stop_next; exit 0' INT TERM

mkdir -p "$RELEASES_DIR"

if [ ! -s "$ENV_BACKUP" ]; then
  log "Missing production environment backup: $ENV_BACKUP"
  exit 1
fi

clear_stale_next

current_sha="$(cd "$APP_DIR" && git rev-parse HEAD)"

if [ -s "$STATE_FILE" ]; then
  IFS=$'\t' read -r active_sha active_dir <"$STATE_FILE" || true
fi

if [ -n "$active_sha" ] && [ -f "$active_dir/.next/BUILD_ID" ]; then
  start_next "$active_dir" || exit 1
elif [ -z "$active_sha" ] && [ -f "$APP_DIR/.next/BUILD_ID" ]; then
  active_sha="$current_sha"
  active_dir="$APP_DIR"
  write_state "$active_sha" "$active_dir"
  start_next "$active_dir" || exit 1
else
  deploy_sha "$current_sha" || exit 1
fi

while true; do
  sleep "$POLL_SECONDS"

  if [ -n "$child_pid" ] && ! kill -0 "$child_pid" 2>/dev/null; then
    log "Next.js exited unexpectedly; restarting"
    wait "$child_pid" 2>/dev/null || true
    child_pid=""
    start_next "$active_dir" || true
  fi

  current_sha="$(cd "$APP_DIR" && git rev-parse HEAD 2>/dev/null || true)"
  if [ -z "$current_sha" ] || [ "$current_sha" = "$active_sha" ]; then
    continue
  fi

  log "Detected new Git commit $current_sha"
  deploy_sha "$current_sha" || log "Deployment $current_sha failed; will retry"
done
