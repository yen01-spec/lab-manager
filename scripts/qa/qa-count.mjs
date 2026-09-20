// STAGING QA 전용 읽기 — 테이블별 행 수 + QA 태그 잔여물
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const out = {}
for (const t of ['reagents', 'reagent_lots', 'locations', 'students', 'admin_users', 'location_requests', 'disposal_requests', 'reagent_change_requests', 'location_history', 'stock_logs', 'admin_logs', 'notices', 'app_settings']) { const { count } = await s.from(t).select('*', { count: 'exact', head: true }); out[t] = count }
const { data: u } = await s.auth.admin.listUsers(); out.auth_users = u.users.length
console.log(JSON.stringify(out))
