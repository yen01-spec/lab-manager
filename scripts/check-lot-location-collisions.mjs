import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

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
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { data: rows } = await supabase
  .from('reagents')
  .select('id, name, location_id, locations(room, detail), reagent_lots(lot_no)')
  .neq('status', 'archived')
  .limit(5000)

function hasRegisteredLot(r) { return (r.reagent_lots || []).some(l => l.lot_no && String(l.lot_no).trim()) }
const rowsWithLot = rows.filter(hasRegisteredLot)

const groups = new Map()
for (const r of rowsWithLot) {
  const key = r.name.trim().toLowerCase()
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(r)
}

let sameLotDiffLocationCount = 0
const examples = []

for (const [name, g] of groups) {
  if (g.length < 2) continue
  const byLotNo = new Map()
  for (const r of g) {
    const lotNo = (r.reagent_lots || []).map(l => l.lot_no).filter(Boolean)[0]
    if (!lotNo) continue
    if (!byLotNo.has(lotNo)) byLotNo.set(lotNo, [])
    byLotNo.get(lotNo).push(r)
  }
  for (const [lotNo, sameLotRows] of byLotNo) {
    if (sameLotRows.length < 2) continue
    const locSet = new Set(sameLotRows.map(r => r.location_id || 'null'))
    if (locSet.size > 1) {
      sameLotDiffLocationCount++
      if (examples.length < 10) {
        examples.push({
          name, lotNo,
          locations: sameLotRows.map(r => r.locations ? `${r.locations.room}${r.locations.detail ? ' ' + r.locations.detail : ''}` : '미지정'),
        })
      }
    }
  }
}

console.log(`같은 이름+같은 Lot No인데 위치가 다른 사례: ${sameLotDiffLocationCount}건`)
examples.forEach(e => console.log(`  - "${e.name}" Lot ${e.lotNo}: ${JSON.stringify(e.locations)}`))
