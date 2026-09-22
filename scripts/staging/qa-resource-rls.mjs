// STAGING 전용 — resource_tabs/resource_articles RLS 실제 권한 확인: anon / non-admin Auth / admin Auth.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const service = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }

const NONADMIN_EMAIL = 'qa-resource-nonadmin@lab.local'
const PW = `Qa-${Math.random().toString(36).slice(2)}A1!`
const { data: nonAdminUser, error: cErr } = await service.auth.admin.createUser({ email: NONADMIN_EMAIL, password: PW, email_confirm: true })
if (cErr) throw new Error('createUser: ' + cErr.message)

try {
  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts)
  const { data: readRows, error: readErr } = await anon.from('resource_tabs').select('id').limit(1)
  ok('anon: SELECT resource_tabs 허용', !readErr, readErr?.message)
  const { error: writeErr } = await anon.from('resource_tabs').insert({ name: 'RLS-QA-anon-' + Date.now() })
  ok('anon: INSERT resource_tabs 거부', !!writeErr, writeErr?.message)

  const nonAdmin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts)
  const login = await nonAdmin.auth.signInWithPassword({ email: NONADMIN_EMAIL, password: PW })
  ok('non-admin Auth 로그인 성공(admin_users 미등록 계정)', !login.error, login.error?.message)
  const { error: naWriteErr } = await nonAdmin.from('resource_tabs').insert({ name: 'RLS-QA-nonadmin-' + Date.now() })
  ok('non-admin Auth(admin_users 미등록): INSERT resource_tabs 거부', !!naWriteErr, naWriteErr?.message)
  const { error: naArticleErr } = await nonAdmin.from('resource_articles').insert({ tab_id: '00000000-0000-0000-0000-000000000000', title: 'x' })
  ok('non-admin Auth: INSERT resource_articles 거부', !!naArticleErr, naArticleErr?.message)

  const QA_ADMIN_STATE = JSON.parse(readFileSync(process.env.QA_STATE_FILE, 'utf-8'))
  const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts)
  const alogin = await admin.auth.signInWithPassword({ email: QA_ADMIN_STATE.admin.email, password: QA_ADMIN_STATE.admin.password })
  ok('admin Auth 로그인 성공', !alogin.error, alogin.error?.message)
  const tabName = 'RLS-QA-admin-tab-' + Date.now()
  const { data: created, error: adminWriteErr } = await admin.from('resource_tabs').insert({ name: tabName }).select('id').single()
  ok('admin Auth(admin_users 등록됨): INSERT resource_tabs 성공', !adminWriteErr, adminWriteErr?.message)
  if (created) {
    const { error: delErr } = await admin.from('resource_tabs').delete().eq('id', created.id)
    ok('admin Auth: DELETE resource_tabs(방금 만든 빈 탭) 성공', !delErr, delErr?.message)
  }
} finally {
  await service.from('admin_users').delete().eq('user_id', nonAdminUser.user.id)
  await service.auth.admin.deleteUser(nonAdminUser.user.id)
  await service.from('resource_tabs').delete().like('name', 'RLS-QA-%')
}

const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
