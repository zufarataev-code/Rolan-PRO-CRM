#!/usr/bin/env bash
# Run on the protected production GitHub environment; never deploys application code.
set -euo pipefail
test -n "${PRODUCTION_SSH_KEY:-}"
test -n "${PRODUCTION_SSH_KNOWN_HOSTS:-}"
test -s /tmp/rolanpro-project-audit.cjs
umask 077
audit_keys_dir="$(mktemp -d)"
trap 'rm -rf "$audit_keys_dir"' EXIT
printf '%s\n' "$PRODUCTION_SSH_KEY" > "$audit_keys_dir/key"
printf '%s\n' "$PRODUCTION_SSH_KNOWN_HOSTS" > "$audit_keys_dir/known_hosts"
unset PRODUCTION_SSH_KEY PRODUCTION_SSH_KNOWN_HOSTS

# The reviewed, bundled read-only program travels over stdin. Nothing is
# installed or written into the server's checkout or active release.
timeout 60 ssh -i "$audit_keys_dir/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$audit_keys_dir/known_hosts" -o ConnectTimeout=15 \
  runcloud@143.110.136.211 '
    set -eu
    export PATH="/home/runcloud/rolanpro-runtime/bin:$PATH"
    set -a
    . /home/runcloud/.rolanpro-crm.env.production.local
    set +a
    audit_release_dir=$(cut -f2 /home/runcloud/.rolanpro-crm-active-release)
    case "$audit_release_dir" in
      /home/runcloud/rolanpro-crm-releases/*) ;;
      *) echo "Unexpected active release path" >&2; exit 1 ;;
    esac
    cd "$audit_release_dir"
    node -
  ' < /tmp/rolanpro-project-audit.cjs > /tmp/rolanpro-project-inventory.json
node -e '
  const r = require("/tmp/rolanpro-project-inventory.json");
  if (r.mode !== "read_only_inventory" || r.ready_to_migrate !== false) process.exit(1);
  console.log(JSON.stringify({mode:r.mode,revision:r.workspace_revision,orders:r.order_count,blocked:r.blocked_count}));
'
