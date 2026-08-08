#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/runcloud/webapps/rolanpro-crm"
RUNTIME_DIR="/home/runcloud/rolanpro-runtime"

export PATH="$RUNTIME_DIR/bin:$PATH"
export NODE_ENV="production"

cd "$APP_DIR"
set -a
. "$APP_DIR/.env.production.local"
set +a

for attempt in $(seq 1 60); do
  if pg_isready -h 127.0.0.1 -p 5433 -d rolanpro >/dev/null 2>&1; then
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    echo "PostgreSQL did not become ready in time" >&2
    exit 1
  fi

  sleep 1
done

./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx prisma/seed.ts

exec ./node_modules/.bin/next start -H 0.0.0.0 -p 3000
