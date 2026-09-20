#!/bin/bash
# usage: scripts/staging/run-with-key.sh <node script> — staging service key 를 CLI 로 받아 환경변수로만 전달(출력/저장 안 함)
cd "$(dirname "$0")/../.."
node scripts/guard-staging-target.mjs > /dev/null || { echo GUARD_FAIL; exit 2; }
KEY=$(npx supabase projects api-keys --project-ref vvafhcqypvejvsuksooi -o json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log((a.find(k=>k.name==='service_role')||{}).api_key||'')})")
[ -n "$KEY" ] || { echo NOKEY; exit 3; }
SUPABASE_SERVICE_ROLE_KEY="$KEY" node "$@"
