#!/usr/bin/env bash
# Load server/.env and curl local + external APIs to verify integrations.
# Usage (Git Bash / WSL / macOS):
#   cd server && bash scripts/healthcheck.sh
# Optional: BASE_URL=http://192.168.x.x:3050 bash scripts/healthcheck.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SERVER_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASS=0
FAIL=0
SKIP=0

if [[ ! -f .env ]]; then
  echo -e "${RED}Missing server/.env${NC}"
  exit 1
fi

# Export env via Node (handles quotes, | in keys, DATABASE_URL query params)
eval "$(node -e "
require('dotenv').config({ path: '.env' });
const keys = [
  'PORT','DATABASE_URL','PUDO_API_KEY','PUDO_API_BASE_URL',
  'POKEDATA_API_KEY','POKEDATA_TCG_API','GEMINI_API_KEY',
  'CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET',
  'RESEND_API_KEY','BETTER_AUTH_URL','BETTER_AUTH_SECRET'
];
for (const k of keys) {
  console.log('export ' + k + '=' + JSON.stringify(process.env[k] || ''));
}
")"

PORT="${PORT:-3050}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
PUDO_BASE="${PUDO_API_BASE_URL:-https://api-pudo.co.za}"
PUDO_BASE="${PUDO_BASE%/}"

echo "=============================================="
echo " FASAPlayer healthcheck (env: server/.env)"
echo " Local API: $BASE_URL"
echo "=============================================="
echo ""

check_env() {
  local name="$1"
  local val="$2"
  if [[ -n "$val" ]]; then
    echo -e "  ${GREEN}✓${NC} $name is set"
    PASS=$((PASS + 1))
    return 0
  fi
  echo -e "  ${YELLOW}○${NC} $name not set (skipped downstream tests)"
  SKIP=$((SKIP + 1))
  return 1
}

http_get() {
  local label="$1"
  local url="$2"
  local extra_args="${3:-}"
  local code
  code=$(curl -sS -o /tmp/fasa_health_$$.json -w "%{http_code}" --connect-timeout 10 --max-time 25 $extra_args "$url" 2>/dev/null || echo "000")
  if [[ "$code" =~ ^2 ]]; then
    echo -e "  ${GREEN}✓${NC} $label (HTTP $code)"
    PASS=$((PASS + 1))
    return 0
  fi
  echo -e "  ${RED}✗${NC} $label (HTTP $code)"
  if [[ -f /tmp/fasa_health_$$.json ]]; then
    head -c 200 /tmp/fasa_health_$$.json 2>/dev/null | tr '\n' ' '
    echo ""
  fi
  FAIL=$((FAIL + 1))
  return 1
}

echo "--- Environment keys ---"
check_env "DATABASE_URL" "$DATABASE_URL"
check_env "PUDO_API_KEY" "$PUDO_API_KEY"
check_env "POKEDATA_API_KEY" "$POKEDATA_API_KEY"
check_env "GEMINI_API_KEY" "$GEMINI_API_KEY"
check_env "CLOUDINARY_CLOUD_NAME" "$CLOUDINARY_CLOUD_NAME"
check_env "RESEND_API_KEY" "$RESEND_API_KEY"
check_env "BETTER_AUTH_SECRET" "$BETTER_AUTH_SECRET"
echo ""

echo "--- Local server ---"
http_get "GET /" "$BASE_URL/"
http_get "GET /api/pudo/lockers" "$BASE_URL/api/pudo/lockers"
http_get "GET /api/listings/recent" "$BASE_URL/api/listings/recent?limit=1"
echo ""

if [[ -n "$DATABASE_URL" ]]; then
  echo "--- Database (Neon) ---"
  if node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.connect()
      .then(() => c.query('SELECT NOW() AS now'))
      .then((r) => { console.log(r.rows[0].now); return c.end(); })
      .catch((e) => { console.error(e.message); process.exit(1); });
  " 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} PostgreSQL connected"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} PostgreSQL connection failed"
    FAIL=$((FAIL + 1))
  fi
  echo ""
fi

if [[ -n "$PUDO_API_KEY" ]]; then
  echo "--- PUDO API (direct) ---"
  enc_key=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$PUDO_API_KEY")
  code=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 25 \
    "$PUDO_BASE/lockers-data?api_key=${enc_key}" 2>/dev/null || echo "000")
  if [[ "$code" =~ ^2 ]]; then
    echo -e "  ${GREEN}✓${NC} GET lockers-data (HTTP $code)"
    PASS=$((PASS + 1))
  elif [[ "$code" == "404" ]]; then
    echo -e "  ${YELLOW}⚠${NC} PUDO lockers-data HTTP 404 (local /api/pudo/lockers uses fallback)"
  else
    echo -e "  ${RED}✗${NC} GET lockers-data (HTTP $code)"
    FAIL=$((FAIL + 1))
  fi
  echo ""
fi

if [[ -n "$CLOUDINARY_CLOUD_NAME" && -n "$CLOUDINARY_API_KEY" && -n "$CLOUDINARY_API_SECRET" ]]; then
  echo "--- Cloudinary ---"
  http_get "GET Cloudinary ping" "https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/ping" \
    -u "${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}"
  echo ""
fi

if [[ -n "$RESEND_API_KEY" ]]; then
  echo "--- Resend ---"
  http_get "GET Resend domains" "https://api.resend.com/domains" \
    -H "Authorization: Bearer ${RESEND_API_KEY}"
  echo ""
fi

if [[ -n "$BETTER_AUTH_URL" ]]; then
  echo "--- Better Auth (remote) ---"
  remote="${BETTER_AUTH_URL%/}"
  http_get "GET $remote/" "$remote/"
  echo ""
fi

rm -f /tmp/fasa_health_$$.json 2>/dev/null

echo "=============================================="
echo -e " Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$SKIP env skipped${NC}"
echo "=============================================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
