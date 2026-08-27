import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const text = fs.readFileSync(new URL('./.env.local', import.meta.url), 'utf-8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const env = loadEnvLocal()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function fetchAll(table, select) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table} fetch 실패: ` + error.message)
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

const tables = [
  'reagents', 'reagent_lots', 'locations',
  'reagent_change_requests', 'disposal_requests', 'location_history',
  'location_requests', 'purchase_request_reagent_items', 'inventory_counts',
  'stock_logs', 'stock_history',
]

const backup = {}
for (const t of tables) {
  backup[t] = await fetchAll(t, '*')
  console.log(`${t}: ${backup[t].length}건 백업`)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = new URL(`./backup-before-rebuild-${stamp}.json`, import.meta.url)
fs.writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf-8')
console.log('저장 완료:', outPath.pathname)
