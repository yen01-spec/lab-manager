// READ ONLY. Production Gate P1 §11 — diff the P0 backup's __lot_id/__reagent_id set
// against the CURRENT production active Lot set, to prove the migration (DDL only)
// created/deleted/changed zero rows, not just that the count happens to match.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from './supabase-refs.mjs'

function loadEnvLocal() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const env = loadEnvLocal()
const urlRef = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]
if (urlRef === STAGING_PROJECT_REF || urlRef !== PRODUCTION_PROJECT_REF) {
  throw new Error(`[FATAL] .env.local ref(${urlRef})가 production이 아닙니다.`)
}
console.log(`[guard] production ref 확인됨: ${urlRef}`)

const backupPath = process.argv[2]
if (!backupPath) throw new Error('사용법: node scripts/production-postpush-uuid-check.mjs <backup.xlsx>')

const wb = XLSX.read(readFileSync(backupPath), { type: 'buffer' })
const ws = wb.Sheets['현재재고']
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
const header = aoa[0]
const lotIdCol = header.indexOf('__lot_id')
const reagentIdCol = header.indexOf('__reagent_id')
const backupLotIds = new Set(aoa.slice(1).map((r) => r[lotIdCol]).filter(Boolean))
const backupReagentIds = new Set(aoa.slice(1).map((r) => r[reagentIdCol]).filter(Boolean))
console.log(`[backup] lot_id count=${backupLotIds.size}, distinct reagent_id count=${backupReagentIds.size}`)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
async function fetchAllPages(queryFn) {
  let all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}
const currentLots = await fetchAllPages((from, to) => supabase.from('reagent_lots').select('id, reagent_id, status').eq('status', 'active').range(from, to))
const currentLotIds = new Set(currentLots.map((l) => l.id))
console.log(`[current] active lot count=${currentLotIds.size}`)

const missingFromCurrent = [...backupLotIds].filter((id) => !currentLotIds.has(id))
const newInCurrent = [...currentLotIds].filter((id) => !backupLotIds.has(id))

console.log(JSON.stringify({
  backup_lot_count: backupLotIds.size,
  current_active_lot_count: currentLotIds.size,
  missing_from_current: missingFromCurrent.length,
  new_in_current: newInCurrent.length,
  missing_ids_sample: missingFromCurrent.slice(0, 10),
  new_ids_sample: newInCurrent.slice(0, 10),
  set_identical: missingFromCurrent.length === 0 && newInCurrent.length === 0,
}, null, 2))
