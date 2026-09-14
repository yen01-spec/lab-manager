// Fail-closed exact-target guard for PRODUCTION preflight operations.
// Deliberately separate from scripts/guard-staging-target.mjs — the two must never be
// interchangeable. Passes ONLY when the CLI is linked to exactly the production ref.
// staging, unknown, and unlinked/empty are all blocked.
//
// This guard only certifies WHICH project is linked. It does not by itself authorize
// writes — Production Gate P0 is read-only by policy; any future write phase (P1+)
// must add its own explicit confirmation on top of this guard, not rely on this alone.
//
// Usage: node scripts/guard-production-target.mjs   (exit 0 = linked project is production)
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
  console.error(`[guard] 먼저 실행: npm run supabase:link:production  (ref=${PRODUCTION_PROJECT_REF})`)
  process.exit(1)
}

if (linkedRef === STAGING_PROJECT_REF) {
  console.error(`[guard] 차단됨 — 현재 linked project가 STAGING(${linkedRef})입니다.`)
  console.error(`[guard] production 작업은 반드시 production(${PRODUCTION_PROJECT_REF})에 연결된 상태에서만 진행하세요.`)
  process.exit(1)
}

if (linkedRef !== PRODUCTION_PROJECT_REF) {
  console.error(`[guard] 차단됨 — linked project(${linkedRef})가 정확히 production ref(${PRODUCTION_PROJECT_REF})와 일치하지 않습니다.`)
  console.error('[guard] 의도한 프로젝트가 맞는지 확인 후 다시 link하세요.')
  process.exit(1)
}

console.log(`[guard] OK — linked project가 정확히 production(${PRODUCTION_PROJECT_REF})입니다.`)
