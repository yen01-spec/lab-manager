// UI 테스트용 개발 서버 — 가짜 Supabase URL로 실행한다(테스트가 모든 *.supabase.co 요청을 가로채므로 어떤 실제 서버에도 연결되지 않음).
// 사용: node scripts/ui/serve-mock.mjs   →  http://localhost:5199   그다음 node scripts/ui/test-*.mjs
import { spawn } from 'node:child_process'
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', '5199', '--strictPort'], {
  stdio: 'inherit', shell: process.platform === 'win32',
  env: { ...process.env, VITE_SUPABASE_URL: 'https://mockproj.supabase.co', VITE_SUPABASE_ANON_KEY: 'mock-anon-key' },
})
child.on('exit', code => process.exit(code ?? 0))
