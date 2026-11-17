#!/usr/bin/env bash
# Run under the CRM's Infisical prod /meta-capi scope with the existing SSH options.
set -euo pipefail

[[ "${META_CAPI_DATASET_ID:-}" = 865337699151965 ]]
[[ "${META_CAPI_UPLOAD_ENABLED:-}" = true || "${META_CAPI_UPLOAD_ENABLED:-}" = false ]]
[[ ${#META_CAPI_ACCESS_TOKEN} -ge 40 && ${#META_CAPI_ACCESS_TOKEN} -le 10000 ]]

[ "$#" -gt 0 ]
{
printf 'set -euo pipefail\numask 077\n'
for name in META_CAPI_DATASET_ID META_CAPI_ACCESS_TOKEN META_CAPI_UPLOAD_ENABLED; do
  printf '%s=%q\n' "$name" "${!name}"
done
cat <<'REMOTE'
env_file=/home/runcloud/.rolanpro-crm.env.production.local
test -f "$env_file"
test "$(id -un)" = runcloud
temporary_file="$(mktemp "${env_file}.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT
awk '!/^(export[[:space:]]+)?META_CAPI_(DATASET_ID|ACCESS_TOKEN|UPLOAD_ENABLED|TEST_EVENT_CODE)=/' "$env_file" > "$temporary_file"
for name in META_CAPI_DATASET_ID META_CAPI_ACCESS_TOKEN META_CAPI_UPLOAD_ENABLED; do
  printf '%s=%q\n' "$name" "${!name}" >> "$temporary_file"
done
# A stale release-local Test Events setting must never reach production.
printf 'META_CAPI_TEST_EVENT_CODE=\n' >> "$temporary_file"
chmod 600 "$temporary_file"
if cmp -s "$env_file" "$temporary_file"; then exit 0; fi
backup_file="$(mktemp "${env_file}.capi-backup-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
cp -p "$env_file" "$backup_file"
chmod 600 "$backup_file"
mv "$temporary_file" "$env_file"
trap - EXIT
REMOTE
} | ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes "$@" \
  'if [ "$(id -un)" = runcloud ]; then bash -s; else sudo -n -u runcloud -- bash -s; fi'
