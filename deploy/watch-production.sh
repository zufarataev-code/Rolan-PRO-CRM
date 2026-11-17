#!/usr/bin/env bash
set -uo pipefail

APP_DIR="/home/runcloud/webapps/rolanpro-crm"
RUNTIME_DIR="/home/runcloud/rolanpro-runtime"
RELEASES_DIR="/home/runcloud/rolanpro-crm-releases"
STATE_FILE="/home/runcloud/.rolanpro-crm-active-release"
ENV_BACKUP="/home/runcloud/.rolanpro-crm.env.production.local"
POLL_SECONDS=15
TICK_SECONDS=5
BACKUP_DIR="/home/runcloud/backups/crm-db"
HEALTH_URL="http://127.0.0.1:3000/api/health"
HEALTH_FAILURES_BEFORE_RESTART=3
# Runtime heap cap: when the CRM leaks or a huge payload arrives, Node dies and
# this watcher restarts it, instead of the kernel OOM-killer picking a victim
# (possibly PostgreSQL) while the whole droplet swaps.
NEXT_MAX_OLD_SPACE_MB="${ROLANPRO_NEXT_MAX_OLD_SPACE_MB:-1024}"
# A failed release build is retried after this pause, not on every poll: an
# endless npm ci + next build loop kept the 4 GB droplet in swap.
DEPLOY_RETRY_SECONDS=300

export PATH="$RUNTIME_DIR/bin:$PATH"
export NODE_ENV="production"

child_pid=""
active_dir=""
active_sha=""
health_failures=0
restart_failures=0
next_restart_at=0
last_health_check_at=0
guarded_job=""
failed_deploy_sha=""
failed_deploy_at=0
SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SELF_HASH="$(sha256sum "$SELF_PATH" | cut -d' ' -f1)"

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

now_epoch() {
  date +%s
}

# HTTP status of the health endpoint; "000" when nothing answers on port 3000.
health_status() {
  local code
  code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null)"
  printf '%s' "${code:-000}"
}

# The Next.js process answers HTTP. 503 means "running, database unreachable":
# restarting Next.js would not fix that, so it counts as answering. An older
# release without /api/health answers 404 or a redirect, which also counts.
server_answers() {
  case "$(health_status)" in
    000|502|504) return 1 ;;
    *) return 0 ;;
  esac
}

process_rss_mb() {
  awk '/^VmRSS:/ { printf "%d", $2 / 1024 }' "/proc/$1/status" 2>/dev/null || printf '?'
}

log_memory() {
  local summary
  summary="$(free -m 2>/dev/null | awk '/^Mem:/ { printf "RAM used %s/%s MB", $3, $2 } /^Swap:/ { printf ", swap used %s/%s MB", $3, $2 }')"
  [ -n "$summary" ] && log "Memory: $summary"
  return 0
}

# Reaps a finished Next.js process and records why it stopped.
note_child_exit() {
  local pid="$1" rc
  wait "$pid" 2>/dev/null
  rc=$?
  if [ "$rc" -eq 127 ]; then
    log "Next.js process $pid stopped (exit code unknown: process adopted after watcher re-exec)"
  elif [ "$rc" -gt 128 ]; then
    log "Next.js process $pid was killed by signal $((rc - 128)) (exit code $rc)"
  else
    log "Next.js process $pid exited with code $rc"
  fi
}

restart_delay() {
  case "$1" in
    1) echo 5 ;;
    2) echo 15 ;;
    3) echo 30 ;;
    4) echo 60 ;;
    *) echo 120 ;;
  esac
}

# Keeps the active release serving. Called every tick of the main loop and
# while a release builds, so the CRM is never left down until the next commit:
#  - a dead process is restarted, with growing pauses between failed attempts
#    and no limit on the number of attempts;
#  - a live process that stops answering HTTP three checks in a row is
#    restarted too.
supervise_next() {
  local now delay pid
  if [ -z "$active_dir" ] || [ ! -f "$active_dir/.next/BUILD_ID" ]; then
    return 0
  fi
  now="$(now_epoch)"

  if [ -n "$child_pid" ] && ! kill -0 "$child_pid" 2>/dev/null; then
    log "Next.js exited unexpectedly"
    note_child_exit "$child_pid"
    log_memory
    child_pid=""
    health_failures=0
  fi

  if [ -z "$child_pid" ]; then
    if [ "$now" -lt "$next_restart_at" ]; then
      return 0
    fi
    log "Restarting Next.js (attempt $((restart_failures + 1)))"
    clear_stale_next
    if start_next "$active_dir"; then
      return 0
    fi
    restart_failures=$((restart_failures + 1))
    delay="$(restart_delay "$restart_failures")"
    next_restart_at=$(( $(now_epoch) + delay ))
    log "Next.js restart failed; next attempt in ${delay}s"
    return 0
  fi

  if [ $((now - last_health_check_at)) -lt "$POLL_SECONDS" ]; then
    return 0
  fi
  last_health_check_at="$now"
  if server_answers; then
    health_failures=0
    return 0
  fi

  health_failures=$((health_failures + 1))
  log "Next.js did not answer the health check ($health_failures/$HEALTH_FAILURES_BEFORE_RESTART)"
  if [ "$health_failures" -ge "$HEALTH_FAILURES_BEFORE_RESTART" ]; then
    pid="$child_pid"
    log "Next.js process $pid is unresponsive (RSS $(process_rss_mb "$pid") MB); restarting"
    log_memory
    stop_next
    clear_stale_next
    health_failures=0
    next_restart_at=0
  fi
}

# Runs a long build step in the background while the active release stays
# supervised, so a crash during a 10-15 minute build is repaired within
# seconds instead of after the build.
run_guarded() {
  local rc
  "$@" &
  guarded_job=$!
  while kill -0 "$guarded_job" 2>/dev/null; do
    sleep 2
    supervise_next
  done
  wait "$guarded_job"
  rc=$?
  guarded_job=""
  return "$rc"
}

stop_guarded_job() {
  if [ -n "$guarded_job" ] && kill -0 "$guarded_job" 2>/dev/null; then
    kill "$guarded_job" 2>/dev/null || true
  fi
  guarded_job=""
}

in_dir() {
  local dir="$1"
  shift
  (cd "$dir" && "$@")
}

# Builds yield CPU and disk to the live CRM and PostgreSQL.
low_priority() {
  if command -v ionice >/dev/null 2>&1; then
    nice -n 10 ionice -c2 -n7 "$@"
  else
    nice -n 10 "$@"
  fi
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
    # Secrets can be rotated independently of a code release. Always load the
    # canonical protected environment immediately before starting Next.js so a
    # prebuilt release never inherits stale variables from the long-running
    # watcher process or an older copied .env.production.local file.
    set -a
    # shellcheck disable=SC1090
    . "$ENV_BACKUP" || exit 1
    set +a
    case " ${NODE_OPTIONS:-} " in
      *--max-old-space-size*) ;;
      *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=$NEXT_MAX_OLD_SPACE_MB" ;;
    esac
    exec ./node_modules/.bin/next start -H 0.0.0.0 -p 3000
  ) &
  child_pid=$!

  for _ in $(seq 1 60); do
    if ! kill -0 "$child_pid" 2>/dev/null; then
      note_child_exit "$child_pid"
      child_pid=""
      return 1
    fi

    if server_answers; then
      sleep 1
      if kill -0 "$child_pid" 2>/dev/null; then
        log "Next.js is healthy on port 3000 (pid $child_pid)"
        health_failures=0
        restart_failures=0
        next_restart_at=0
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

# Connection details reach libpq through the environment of a subshell
# (readable only by this user), never through argv where `ps` shows them.
pg_dump_from_env() {
  local file="$1"
  (
    set -a
    . "$ENV_BACKUP" || exit 1
    set +a
    eval "$(python3 -c '
import os, shlex, urllib.parse as u
p = u.urlsplit(os.environ["DATABASE_URL"])
q = dict(u.parse_qsl(p.query))
vals = {"PGHOST": p.hostname or q.get("host", ""), "PGPORT": str(p.port or ""), "PGUSER": u.unquote(p.username or ""), "PGPASSWORD": u.unquote(p.password or ""), "PGDATABASE": u.unquote(p.path.lstrip("/"))}
for k, v in vals.items():
    if v: print("export %s=%s" % (k, shlex.quote(v)))
')" || exit 1
    unset DATABASE_URL
    [ -n "${PGHOST:-}" ] && [ -n "${PGDATABASE:-}" ] || exit 1
    pg_dump --format=custom --no-owner --no-privileges --file="$file"
  )
}

backup_database() {
  local sha="$1"
  local backup_dir="$BACKUP_DIR"
  local name partial
  install -d -m 700 "$backup_dir" || return 1
  # A failed migration is retried on the next poll. The first dump of this
  # commit is the clean pre-migration state: keep it, never replace it with a
  # dump of a half-migrated database (and never let retries rotate it out).
  # Keyed by the full commit hash: short prefixes are not guaranteed unique.
  if ls "$backup_dir"/rolanpro-*-"${sha}"-premigrate.dump >/dev/null 2>&1; then
    log "Pre-migration backup for ${sha:0:7} already exists; keeping the first one"
    return 0
  fi
  name="rolanpro-$(date -u +%Y%m%dT%H%M%SZ)-${sha}-premigrate.dump"
  partial="$backup_dir/.partial-$name"
  # Only one watcher runs: any partial left by an interrupted dump is garbage.
  rm -f "$backup_dir"/.partial-*
  if ! pg_dump_from_env "$partial" \
    || ! chmod 600 "$partial" \
    || ! test -s "$partial" \
    || ! pg_restore --list "$partial" > /dev/null; then
    rm -f "$partial"
    return 1
  fi
  mv "$partial" "$backup_dir/$name" || return 1
  log "Database backup before migrations: $backup_dir/$name"
  ls -1t "$backup_dir"/rolanpro-*.dump | tail -n +31 | xargs -r rm -f
  return 0
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
  if ! run_guarded in_dir "$temporary_dir" low_priority env -u NODE_ENV npm ci; then
    log "Dependency installation failed for $sha"
    return 1
  fi

  if ! run_guarded in_dir "$temporary_dir" low_priority ./node_modules/.bin/prisma generate; then
    log "Prisma client generation failed for $sha"
    return 1
  fi

  log "Building Next.js release $sha"
  # The current CRM route graph exceeds a 768 MB V8 heap during Next.js type/build analysis.
  # Keep this bounded below total server memory while leaving room for the active release.
  if ! run_guarded in_dir "$temporary_dir" low_priority env NODE_OPTIONS=--max-old-space-size=1024 npm run build; then
    log "Next.js build failed for $sha"
    return 1
  fi

  if ! wait_for_database; then
    return 1
  fi

  # Backup taken immediately before migrations (after the long build), so a
  # restore loses at most the seconds between this dump and the migration.
  # The deploy workflow also takes one before the release starts building.
  if ! backup_database "$sha"; then
    log "Database backup failed for $sha; migrations not applied"
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

cleanup_partials() {
  rm -f "$BACKUP_DIR"/.partial-* 2>/dev/null || true
}

# A deploy that changes this script re-executes it, so new deploy steps (like
# the pre-migration backup) apply to the very next release. The running
# Next.js child is handed over, not restarted.
reexec_if_script_changed() {
  local hash
  hash="$(sha256sum "$SELF_PATH" 2>/dev/null | cut -d' ' -f1)"
  if [ -n "$hash" ] && [ "$hash" != "$SELF_HASH" ] && bash -n "$SELF_PATH"; then
    log "Watcher script changed; re-executing"
    export ROLANPRO_ADOPT_CHILD_PID="$child_pid"
    exec "$SELF_PATH"
  fi
}

record_failed_deploy() {
  failed_deploy_sha="$1"
  failed_deploy_at="$(now_epoch)"
  log "Deployment $1 failed; retrying in ${DEPLOY_RETRY_SECONDS}s"
}

deploy_is_backing_off() {
  [ "$1" = "$failed_deploy_sha" ] && [ $(( $(now_epoch) - failed_deploy_at )) -lt "$DEPLOY_RETRY_SECONDS" ]
}

main() {
  trap 'stop_guarded_job; cleanup_partials; stop_next; exit 0' INT TERM

  mkdir -p "$RELEASES_DIR"

  if [ ! -s "$ENV_BACKUP" ]; then
    log "Missing production environment backup: $ENV_BACKUP"
    exit 1
  fi

  cleanup_partials

  current_sha="$(cd "$APP_DIR" && git rev-parse HEAD)"

  if [ -s "$STATE_FILE" ]; then
    IFS=$'\t' read -r active_sha active_dir <"$STATE_FILE" || true
  fi

  adopt_pid="${ROLANPRO_ADOPT_CHILD_PID:-}"
  unset ROLANPRO_ADOPT_CHILD_PID
  if [ -n "$adopt_pid" ] && kill -0 "$adopt_pid" 2>/dev/null && [ -n "$active_sha" ]; then
    # Re-executed after a script update: keep serving from the running process.
    child_pid="$adopt_pid"
    log "Adopted running Next.js process $child_pid for $active_sha"
  else
    clear_stale_next
  fi

  # A failed first start no longer exits the watcher (supervisord gives up
  # after a few quick exits and leaves the CRM down): the loop below keeps
  # retrying with growing pauses.
  if [ -n "$child_pid" ]; then
    :
  elif [ -n "$active_sha" ] && [ -f "$active_dir/.next/BUILD_ID" ]; then
    start_next "$active_dir" || log "Initial Next.js start failed; the watcher will keep retrying"
  elif [ -z "$active_sha" ] && [ -f "$APP_DIR/.next/BUILD_ID" ]; then
    active_sha="$current_sha"
    active_dir="$APP_DIR"
    write_state "$active_sha" "$active_dir"
    start_next "$active_dir" || log "Initial Next.js start failed; the watcher will keep retrying"
  else
    deploy_sha "$current_sha" || record_failed_deploy "$current_sha"
  fi

  while true; do
    sleep "$TICK_SECONDS"

    supervise_next

    current_sha="$(cd "$APP_DIR" && git rev-parse HEAD 2>/dev/null || true)"
    if [ -z "$current_sha" ] || [ "$current_sha" = "$active_sha" ]; then
      continue
    fi
    if deploy_is_backing_off "$current_sha"; then
      continue
    fi
    reexec_if_script_changed

    log "Detected new Git commit $current_sha"
    if deploy_sha "$current_sha"; then
      failed_deploy_sha=""
    else
      record_failed_deploy "$current_sha"
    fi
  done
}

# Sourcing the script (tests) defines the functions without starting the watcher.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
