// 1차 실행에서 reagent_lots는 이미 마스터로 재소속됐지만, inventory_counts
// FK 누락으로 삭제가 실패해 "Lot이 0개인 빈 껍데기" reagents row가 346개
// 남았다. 이 스크립트는 그 빈 껍데기를 찾아서 같은 이름의 마스터(Lot을
// 가진 쪽)로 FK를 마저 재포인팅하고 삭제한다.
//
// 마이그레이션 시작 전 reagents:reagent_lots가 완전 1:1이었음이 이미
// 확인됐으므로, 지금 Lot이 0개인 reagents row는 전부 이번 마이그레이션이
// 만든 빈 껍데기다(원래부터 Lot 없는 row는 없었음).
//
// 사용법: node scripts/cleanup-orphaned-duplicates.mjs [--execute]

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

const FK_TABLES = [
  'reagent_change_requests',
  'disposal_requests',
  'location_history',
  'location_requests',
  'purchase_request_reagent_items',
  'inventory_counts',
  'stock_history', // 예전 입출고 기록 이력(UI는 제거됐지만 과거 데이터가 테이블에 남아있음)
]

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 ===')
  const { data: allRows, error } = await supabase
    .from('reagents')
    .select('id, name, reagent_lots(id)')
    .neq('status', 'archived')
    .limit(5000)
  if (error) throw error

  const orphans = allRows.filter(r => (r.reagent_lots || []).length === 0)
  const withLots = allRows.filter(r => (r.reagent_lots || []).length > 0)
  console.log(`Lot 0개(빈 껍데기) reagents: ${orphans.length}`)

  const masterByName = new Map()
  for (const r of withLots) {
    const key = r.name.trim().toLowerCase()
    if (!masterByName.has(key)) masterByName.set(key, r) // 여러 개면 첫 번째(정상적으로는 1개만 있어야 함)
  }

  let deleted = 0, noMaster = 0
  const noMasterNames = []

  for (const orphan of orphans) {
    const key = orphan.name.trim().toLowerCase()
    const master = masterByName.get(key)
    if (!master) { noMaster++; noMasterNames.push(orphan.name); continue }

    if (EXECUTE) {
      for (const table of FK_TABLES) {
        const { error: fkErr } = await supabase.from(table).update({ reagent_id: master.id }).eq('reagent_id', orphan.id)
        if (fkErr) console.error(`${table} FK 재포인팅 실패 (${orphan.id}):`, fkErr.message)
      }
      const { error: delErr } = await supabase.from('reagents').delete().eq('id', orphan.id)
      if (delErr) { console.error(`삭제 실패 (${orphan.id}, "${orphan.name}"):`, delErr.message) } else { deleted++ }
    }
  }

  console.log(`마스터를 찾아 처리한 orphan: ${orphans.length - noMaster}`)
  console.log(`마스터를 못 찾은 orphan(수동 확인 필요): ${noMaster}`)
  if (noMasterNames.length > 0) console.log('  이름:', JSON.stringify(noMasterNames.slice(0, 20)))

  if (EXECUTE) {
    console.log(`실제 삭제된 row: ${deleted}`)
    const { count: reagentsCount } = await supabase.from('reagents').select('*', { count: 'exact', head: true }).neq('status', 'archived')
    const { count: lotsCount } = await supabase.from('reagent_lots').select('*', { count: 'exact', head: true })
    console.log(`최종 reagents(비archived) 수: ${reagentsCount}`)
    console.log(`최종 reagent_lots 수: ${lotsCount}`)
  } else {
    console.log('드라이런 완료. 실제 반영하려면 --execute')
  }
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
