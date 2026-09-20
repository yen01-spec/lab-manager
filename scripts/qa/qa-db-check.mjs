// STAGING QA 전용 읽기 검증 — QA 시약/요청 상태를 service key 로 확인(쓰기 없음)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TAG = 'QA-BROWSER-20260924'
const { data: rs } = await s.from('reagents').select('id,name,cas_no,cas_source,company,company_source,purity,category,category_source,volume,volume_source,unit,name_ko').eq('notes', TAG).in('name', ['Acetone'])
console.log('Acetone row:', JSON.stringify(rs))
const ids = (await s.from('reagents').select('id').eq('notes', TAG)).data.map(x => x.id)
for (const t of ['location_requests', 'disposal_requests', 'reagent_change_requests']) {
  const { data } = await s.from(t).select('id,status,reagent_id').in('reagent_id', ids)
  const by = {}; for (const r of data || []) by[r.status] = (by[r.status] || 0) + 1
  console.log(t, JSON.stringify(by))
}
const { data: lots } = await s.from('reagent_lots').select('id,lot_no,status,reagent_id').in('reagent_id', ids).like('lot_no', 'QA-AC1')
console.log('QA-AC1 lots', lots?.length, JSON.stringify(lots?.map(l => l.status)))
