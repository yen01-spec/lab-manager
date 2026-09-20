#!/bin/bash
# staging 전용: 픽스처 → production baseline(범위 테이블) → 시드 → pending migration 전부(순서대로) → 회귀 스위트 전체.
# 사용: bash scripts/staging/reset-and-run-all.sh [--no-reset]   (guard 통과 필수, production 에는 절대 사용하지 않는다)
set -u
cd "$(dirname "$0")/../.."
RUN=scripts/staging/run-with-key.sh
q() { npx supabase db query --linked --file "$1" > /dev/null 2>&1 || { echo "DBQUERY FAIL: $1"; exit 3; }; }
node scripts/guard-staging-target.mjs > /dev/null || { echo "GUARD FAIL"; exit 2; }
if [ "${1:-}" != "--no-reset" ]; then
  q scripts/staging/auth-fixture-cleanup.sql
  for f in auth disposal batch1 review inventory-workflow acl; do q scripts/staging/$f-fixture-schema.sql; done
  q scripts/staging/production-baseline-scope.sql
  q scripts/staging/post-baseline-seed.sql
  for m in $(ls supabase/migrations/20260913*.sql supabase/migrations/2026091[6-9]*.sql supabase/migrations/202609[2-9]*.sql 2>/dev/null | sort -u); do q "$m"; done
fi
for t in test-auth-rpc test-session-token test-batch1-requests; do
  node scripts/staging/$t.mjs > "reg-$t.log" 2>&1; echo "$t exit=$? $(grep -E '^TOTAL' reg-$t.log)"
done
for t in test-admin-reviews test-request-unification test-bottle-unit test-inventory-workflow test-reagent-domain test-acl-matrix; do
  [ -f scripts/staging/$t.mjs ] || continue
  $RUN scripts/staging/$t.mjs > "reg-$t.log" 2>&1; echo "$t exit=$? $(grep -E '^TOTAL' reg-$t.log)"
done
q scripts/staging/inventory-snapshot-fixture-reset.sql; q scripts/staging/inventory-snapshot-fixture-data.sql
$RUN scripts/staging/test-inventory-snapshot-rpc.mjs > reg-inv.log 2>&1; echo "inventory exit=$? $(grep -E 'TOTAL' reg-inv.log)"
# 복원 리허설은 범위 테이블을 비우고 합성 데이터로 채우므로 마지막에 실행한다.
$RUN scripts/staging/test-backup-restore.mjs > reg-test-backup-restore.log 2>&1; echo "test-backup-restore exit=$? $(grep -E '^TOTAL' reg-test-backup-restore.log)"
$RUN scripts/staging/test-backup-restore-full.mjs > reg-test-backup-restore-full.log 2>&1; echo "test-backup-restore-full exit=$? $(grep -E '^TOTAL' reg-test-backup-restore-full.log)"
grep -l "FAIL\]" reg-*.log
