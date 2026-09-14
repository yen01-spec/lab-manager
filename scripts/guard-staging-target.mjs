// Fail-closed exact-target guard for staging-only Supabase CLI operations
// (db push, future RPC/migration tests). Passes ONLY when the CLI is
// currently linked to exactly the staging project ref. Everything else
// (production, unknown ref, unlinked/empty) is blocked.
//
// Usage: node scripts/guard-staging-target.mjs   (exit 0 = safe to proceed)
import { readFileSync } from 'node:fs'
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from './supabase-refs.mjs'

const linkedRefPath = new URL('../supabase/.temp/project-ref', import.meta.url)

let linkedRef = ''
try {
  linkedRef = readFileSync(linkedRefPath, 'utf-8').trim()
} catch {
  linkedRef = ''
}

if (linkedRef === '') {
  console.error('[guard] 차단됨 — linked project가 없습니다(비어있음/unlinked).')
  console.error(`[guard] 먼저 실행: npm run supabase:link:staging  (ref=${STAGING_PROJECT_REF})`)
  process.exit(1)
}

if (linkedRef === PRODUCTION_PROJECT_REF) {
  console.error(`[guard] 차단됨 — 현재 linked project가 PRODUCTION(${linkedRef})입니다.`)
  console.error(`[guard] staging 작업은 반드시 staging(${STAGING_PROJECT_REF})에 연결된 상태에서만 진행하세요.`)
  process.exit(1)
}

if (linkedRef !== STAGING_PROJECT_REF) {
  console.error(`[guard] 차단됨 — linked project(${linkedRef})가 정확히 staging ref(${STAGING_PROJECT_REF})와 일치하지 않습니다.`)
  console.error('[guard] 의도한 프로젝트가 맞는지 확인 후 다시 link하세요.')
  process.exit(1)
}

console.log(`[guard] OK — linked project가 정확히 staging(${STAGING_PROJECT_REF})입니다.`)
