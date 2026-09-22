// STAGING 전용 — 자료실 CMS 실브라우저 QA용 관리자 Supabase Auth 계정 생성(admin_users 등록).
// mode: create | clean
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const STATE_PATH = process.env.QA_STATE_FILE
const EMAIL = 'qa-resource-admin@lab.local'
const mode = process.argv[2]

if (mode === 'clean') {
  const { data: u } = await s.auth.admin.listUsers()
  const found = u.users.find(x => x.email === EMAIL)
  if (found) {
    await s.from('admin_users').delete().eq('user_id', found.id)
    await s.auth.admin.deleteUser(found.id)
    console.log('QA admin removed:', EMAIL)
  } else console.log('QA admin not found (already clean)')
  if (STATE_PATH && existsSync(STATE_PATH)) { unlinkSync(STATE_PATH); console.log('state file removed') }
  process.exit(0)
}

const PASSWORD = `Qa-${Math.random().toString(36).slice(2)}A1!`
const { data: u, error } = await s.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
if (error) throw new Error('createUser: ' + error.message)
const ins = await s.from('admin_users').insert({ user_id: u.user.id, active: true, note: 'QA-RESOURCE-LIBRARY' })
if (ins.error) throw new Error('admin_users insert: ' + ins.error.message)
writeFileSync(STATE_PATH, JSON.stringify({ admin: { email: EMAIL, password: PASSWORD } }, null, 1))
console.log('QA admin created:', EMAIL, '-> state file:', STATE_PATH)
