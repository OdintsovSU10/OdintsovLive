#!/bin/sh

set -eu

SYNC_SCRIPT="${SYNC_SCRIPT:-/opt/sites/fot-token-api/sync-fot-timesheet.mjs}"
LOOKBACK_DAYS="${FOT_TIMESHEET_LOOKBACK_DAYS:-3}"
DEPARTMENT_IDS="${FOT_TIMESHEET_DEPARTMENT_IDS:-}"
MODE="${1:-recent}"

if [ ! -r "$SYNC_SCRIPT" ]; then
  echo "FOT sync script is not readable: $SYNC_SCRIPT" >&2
  exit 1
fi

if [ -z "$DEPARTMENT_IDS" ]; then
  echo "FOT_TIMESHEET_DEPARTMENT_IDS must be configured" >&2
  exit 1
fi

# recent — последние LOOKBACK_DAYS дней (раз в минуту);
# months — с начала прошлого месяца по сегодня (раз в час), чтобы забирать поздние корректировки FOT.
if [ "$MODE" = "months" ]; then
  TODAY="$(TZ=Europe/Moscow date +%Y-%m-%d)"
  FROM="$(TZ=Europe/Moscow date -d "$(TZ=Europe/Moscow date +%Y-%m-15) -1 month" +%Y-%m-01)"
  RANGE_ARGS="--from $FROM --to $TODAY"
else
  RANGE_ARGS="--lookback-days $LOOKBACK_DAYS"
fi

docker exec -i \
  -e FOT_TIMESHEET_DEPARTMENT_IDS="$DEPARTMENT_IDS" \
  -e RANGE_ARGS="$RANGE_ARGS" \
  fot-token-api sh -eu -c '
    export FOT_API="$FOT_BASE/external/v1/tables/employees"
    export FOT_TIMESHEET_API="$FOT_BASE/api/public/v1/timesheet"
    export FOT_API_TOKEN="$(cat "$TOKEN_FILE")"
    export SUPABASE_URL="$KONG_URL"
    export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
    node - $RANGE_ARGS --skip-import-log
  ' < "$SYNC_SCRIPT"
