// STAGING 프론트엔드 개발 서버 — 실제 staging Supabase 에 연결(mock 아님). http://localhost:5299
// .env.local 에는 production 값이 들어 있으므로, 프로세스 환경변수로 Supabase/Firebase 값을 명시적으로 덮어쓴다(process env 가 .env 파일보다 우선).
// Firebase 는 QA 중 외부(production Firebase)와 통신하지 않도록 비활성 더미 값으로 바꾼다.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'

const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
const ref = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]
if (ref === PRODUCTION_PROJECT_REF || ref !== STAGING_PROJECT_REF) { console.error(`[FATAL] ref(${ref}) is not staging`); process.exit(2) }
console.log(`[serve-staging] Supabase ref = ${ref} (staging)`)
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', '5299', '--strictPort', '--mode', 'staging'], {
  stdio: 'inherit', shell: process.platform === 'win32',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    VITE_FIREBASE_API_KEY: 'qa-disabled', VITE_FIREBASE_AUTH_DOMAIN: 'qa-disabled.invalid', VITE_FIREBASE_PROJECT_ID: 'qa-disabled',
    VITE_FIREBASE_STORAGE_BUCKET: 'qa-disabled.invalid', VITE_FIREBASE_MESSAGING_SENDER_ID: '0', VITE_FIREBASE_APP_ID: 'qa-disabled', VITE_FIREBASE_VAPID_KEY: 'qa-disabled',
  },
})
child.on('exit', code => process.exit(code ?? 0))
