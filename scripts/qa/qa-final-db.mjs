// STAGING QA 전용 읽기 — QA-FINAL 시약/Lot 의 영구 값 스냅샷 + 관련 감사 행 덤프(쓰기 없음)
//   node ... snap <name>   → scratchpad/<name>.json 저장 후 마지막 스냅샷과 diff 출력
//   node ... dump          → 요청/이력/실사/로그 행 요약
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const st = JSON.parse(readFileSync(process.env.QA_STATE_FILE, 'utf-8'))
const dir = dirname(process.env.QA_STATE_FILE)
const rIds = Object.values(st.reagents), lIds = Object.values(st.lots)
const [cmd, name] = process.argv.slice(2)
if (cmd === 'snap') {
  const { data: rs } = await s.from('reagents').select('id,name,name_ko,cas_no,company,purity,category,volume,unit,status,pending_confirm,last_confirmed_at').in('id', rIds)
  const { data: ls } = await s.from('reagent_lots').select('id,lot_no,status,sealed_count,current_stock,location_id,pending_confirm,needs_action,opened_date,disposal_date').in('id', lIds)
  const byKey = (o, arr) => Object.fromEntries(Object.entries(o).map(([k, id]) => [k, arr.find(x => x.id === id)]))
  const snap = { at: new Date().toISOString(), reagents: byKey(st.reagents, rs), lots: byKey(st.lots, ls) }
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(snap, null, 1))
  const prevFile = process.env.QA_PREV
  if (prevFile && existsSync(`${dir}/${prevFile}.json`)) {
    const prev = JSON.parse(readFileSync(`${dir}/${prevFile}.json`, 'utf-8'))
    const diffs = []
    for (const kind of ['reagents', 'lots']) for (const [k, row] of Object.entries(snap[kind])) for (const [f, v] of Object.entries(row || {})) { const pv = prev[kind][k]?.[f]; if (JSON.stringify(pv) !== JSON.stringify(v)) diffs.push(`${kind}.${k}.${f}: ${JSON.stringify(pv)} -> ${JSON.stringify(v)}`) }
    console.log(`DIFF vs ${prevFile}: ${diffs.length ? '\n  ' + diffs.join('\n  ') : 'NONE (permanent master unchanged)'}`)
  } else console.log('snapshot saved:', name)
} else if (cmd === 'dump') {
  const pick = async (t, cols, filter) => { let q = s.from(t).select(cols); if (filter) q = filter(q); const { data, error } = await q; return error ? { error: error.message } : data }
  const out = {}
  out.inventory_sessions = await pick('inventory_sessions', 'id,status,label,year,purpose,zones,created_by,completed_at', q => q.like('label', 'QA_FINAL%'))
  const sid = (out.inventory_sessions[0] || {}).id
  if (sid) out.inventory_counts = await pick('inventory_counts', 'id,lot_id,book_sealed,book_stock,actual_sealed,actual_stock,counted_by_student_id,reported_missing', q => q.eq('session_id', sid))
  out.location_requests = await pick('location_requests', 'id,status,lot_id,from_location_name,to_location_name,requested_by,approved_by', q => q.in('reagent_id', rIds))
  out.disposal_requests = await pick('disposal_requests', 'id,status,lot_id,lot_no,requested_by,reason,approved_by', q => q.in('reagent_id', rIds))
  out.reagent_change_requests = await pick('reagent_change_requests', 'id,status,field_name,old_value,new_value,requested_by,approved_by,review_note', q => q.in('reagent_id', rIds))
  out.location_history = await pick('location_history', 'id,lot_id,from_location_name,to_location_name,moved_by', q => q.in('reagent_id', rIds))
  out.stock_logs = await pick('stock_logs', 'id,lot_id,before_sealed,before_stock,after_sealed,after_stock,user_name,notes', q => q.in('lot_id', lIds))
  out.admin_logs = await pick('admin_logs', 'action,target_type,description', q => q.gte('created_at', st.t0))
  console.log(JSON.stringify(out, null, 1))
}
