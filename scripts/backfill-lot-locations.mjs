// reagents.location_id → reagent_lots.location_id 전체 백필.
// 병합 과정에서 재소속된 Lot은 이미 옛 reagents.location_id를 물려받았지만,
// 마스터 자신의 원래 Lot이나 애초에 병합 대상이 아니었던 Lot은 아직
// location_id가 비어있다. 소속 reagents의 현재 location_id를 그대로
// 복사해 채운다(값이 이미 있는 Lot은 건드리지 않음).
//
// 사용법: node scripts/backfill-lot-locations.mjs [--execute]

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
const EXECUTE = process.argv.includes('--execute')

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 ===')
  const { data: reagents, error } = await supabase
    .from('reagents')
    .select('id, location_id, reagent_lots(id, location_id)')
    .neq('status', 'archived')
    .limit(5000)
  if (error) throw error

  let toFill = 0, noReagentLocation = 0
  for (const r of reagents) {
    for (const lot of r.reagent_lots || []) {
      if (lot.location_id) continue
      if (!r.location_id) { noReagentLocation++; continue }
      toFill++
      if (EXECUTE) {
        const { error: upErr } = await supabase.from('reagent_lots').update({ location_id: r.location_id }).eq('id', lot.id)
        if (upErr) console.error(`Lot ${lot.id} 위치 백필 실패:`, upErr.message)
      }
    }
  }

  console.log(`채울 수 있는 Lot(reagents에 위치정보 있음): ${toFill}`)
  console.log(`reagents 자체도 위치정보 없어서 못 채우는 Lot: ${noReagentLocation}`)
  if (!EXECUTE) console.log('드라이런 완료. 실제 반영하려면 --execute')
  else console.log('완료.')
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
