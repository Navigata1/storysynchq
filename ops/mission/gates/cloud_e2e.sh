#!/usr/bin/env bash
# Gate: a link published to production's cloud library opens in a fresh browser context
# with no account (C4), and production's database refuses anonymous listing (C3b).
#
# This touches production data, so it runs only when the operator has set, in the
# environment: A2_CLOUD_E2E=1, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# for production's project. Without them it fails closed (exit 1): an unrun cloud check is
# an unverified claim, never a pass. The spec it runs is tests/a2-cloud.spec.ts, written
# and registered in P1 before any fix.
set -u
cd "$(git rev-parse --show-toplevel)"
if [ "${A2_CLOUD_E2E:-}" != 1 ] || [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  echo "[FAIL] cloud e2e not authorised in this environment (needs A2_CLOUD_E2E=1 and production's public Supabase URL and anon key)"
  exit 1
fi
[ -f tests/a2-cloud.spec.ts ] || { echo "[FAIL] tests/a2-cloud.spec.ts is not written yet"; exit 1; }
CI=1 npx playwright test tests/a2-cloud.spec.ts
