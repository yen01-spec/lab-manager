// 시약 마스터/Lot 구조 분리 — 데이터 마이그레이션 스크립트
//
// 지금 reagents/reagent_lots는 스키마상 1:N이지만 실제로는 100% 1:1이다
// (동일 이름 시약도 병마다 별도의 reagents row로 되어 있음). 이 스크립트는
// 이름이 같은 reagents row들을 하나의 "마스터"로 합치고, 나머지의
// reagent_lots를 마스터 밑으로 재소속시킨다.
//
// 기본은 드라이런(쓰기 없음, 리포트만 출력). 실제로 반영하려면 --execute.
//
// 사용법:
//   node scripts/consolidate-reagent-masters.mjs            (드라이런)
//   node scripts/consolidate-reagent-masters.mjs --execute   (실제 반영)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

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

function isJunkCompany(v) {
  if (!v) return true
  const t = String(v).trim()
  if (!t) return true
  if (t === '?') return true
  if (/^[\d.]+$/.test(t)) return true // 숫자만인 값(컬럼 밀림 흔적)
  return false
}

// 정식 CAS 번호 형식(2~7자리-2자리-1자리 체크디지트). 엑셀 임포트 과정에서
// 카탈로그 번호가 섞여 들어가거나, 날짜로 잘못 파싱된 값("7791-03-09
// 00:00:00")을 걸러내기 위함.
const CAS_RE = /^\d{2,7}-\d{2}-\d$/
function isValidCas(v) {
  return !!v && CAS_RE.test(String(v).trim())
}

function fieldScore(r) {
  let s = 0
  if (isValidCas(r.cas_no)) s++
  if (r.company && !isJunkCompany(r.company)) s++
  if (r.category && r.category.trim()) s++
  if (r.hazard && r.hazard.trim()) s++
  return s
}

async function fetchAllReagents() {
  const { data, error } = await supabase
    .from('reagents')
    .select('id, name, cas_no, company, category, hazard, volume, unit, location_id, notes, created_at, reagent_type, status, reagent_lots(lot_no)')
    .neq('status', 'archived')
    .limit(5000)
  if (error) throw error
  return data
}

// 원본 엑셀 일괄등록 데이터 상당수가 Lot 번호 자체가 비어있다(현재 개발
// 단계 DB의 알려진 한계). Lot 번호가 없는 시약은 "미상"으로 취급해서
// 이름이 같아도 절대 병합/삭제/재고 수정 대상에 포함하지 않는다 — 실제
// 물리적으로 같은 병인지 확신할 근거가 없기 때문.
function hasRegisteredLot(r) {
  return (r.reagent_lots || []).some(l => l.lot_no && String(l.lot_no).trim())
}

function groupByName(rows) {
  const groups = new Map()
  for (const r of rows) {
    const key = r.name.trim().toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  return groups
}

function pickMaster(rows) {
  const sorted = [...rows].sort((a, b) => {
    const sa = fieldScore(a), sb = fieldScore(b)
    if (sa !== sb) return sb - sa
    return new Date(a.created_at) - new Date(b.created_at)
  })
  return sorted[0]
}

function computeBackfill(master, duplicates) {
  const patch = {}
  const fields = ['category', 'hazard', 'volume', 'unit', 'notes']
  for (const f of fields) {
    if (master[f] === null || master[f] === undefined || master[f] === '') {
      const donor = duplicates.find(d => d[f] !== null && d[f] !== undefined && d[f] !== '')
      if (donor) patch[f] = donor[f]
    }
  }
  if (isJunkCompany(master.company)) {
    const donor = duplicates.find(d => !isJunkCompany(d.company))
    if (donor) patch.company = donor.company
  }
  if (!isValidCas(master.cas_no)) {
    const donor = duplicates.find(d => isValidCas(d.cas_no))
    if (donor) patch.cas_no = donor.cas_no
  }
  return patch
}

const FK_TABLES = [
  'reagent_change_requests',
  'disposal_requests',
  'location_history',
  'location_requests',
  'purchase_request_reagent_items',
  'inventory_counts', // lot_id와 별개로 reagent_id를 중복 저장하고 있어 별도 재포인팅 필요(1차 실행에서 누락되어 삭제 실패의 원인이었음)
  'stock_history', // 예전 입출고 기록 이력(UI는 제거됐지만 과거 데이터가 테이블에 남아있음)
]

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 (쓰기 없음) ===')
  const allRows = await fetchAllReagents()
  const rows = allRows.filter(hasRegisteredLot)
  const unregistered = allRows.length - rows.length

  console.log(`전체 reagents: ${allRows.length}`)
  console.log(`Lot 번호 미등록(미상 처리, 병합 대상에서 완전히 제외): ${unregistered}개`)

  const groups = groupByName(rows)
  const dupGroupEntries = [...groups.entries()].filter(([, g]) => g.length > 1)

  console.log(`Lot 등록된 reagents(병합 후보 풀): ${rows.length}`)
  console.log(`고유 이름 그룹: ${groups.size}`)
  console.log(`병합 대상 그룹(2개 이상): ${dupGroupEntries.length}`)
  console.log(`병합 대상 row 총합: ${dupGroupEntries.reduce((s, [, g]) => s + g.length, 0)}`)
  console.log('')

  const suspicious = []
  const deletionLog = [] // 실제로 삭제될(병합되어 사라질) reagents row 전체 기록
  let sampleShown = 0

  for (const [name, groupRows] of dupGroupEntries) {
    const master = pickMaster(groupRows)
    const duplicates = groupRows.filter(r => r.id !== master.id)
    const patch = computeBackfill(master, duplicates)

    // 정상 형식의 CAS가 서로 다른 값으로 2개 이상 갈리면 진짜 의심 사례 —
    // 서로 다른 물질/수화물일 수 있으니 자동 병합하지 않고 건너뛴다.
    const validCasValues = new Set(groupRows.map(r => r.cas_no).filter(isValidCas))
    if (validCasValues.size > 1) {
      suspicious.push({ name, casValues: [...validCasValues], ids: groupRows.map(r => r.id) })
      continue
    }

    if (sampleShown < 8) {
      console.log(`[샘플] "${name}" — ${groupRows.length}개 → 마스터 ${master.id.slice(0, 8)}`)
      if (Object.keys(patch).length > 0) console.log(`  보완될 필드: ${JSON.stringify(patch)}`)
      sampleShown++
    }

    for (const dup of duplicates) {
      deletionLog.push({
        group_name: name,
        deleted_id: dup.id,
        deleted_cas: dup.cas_no || '',
        deleted_company: dup.company || '',
        deleted_lot_no: (dup.reagent_lots || []).map(l => l.lot_no).filter(Boolean).join(';'),
        master_id: master.id,
        master_cas: master.cas_no || '',
        master_company: master.company || '',
      })
    }

    if (EXECUTE) {
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('reagents').update(patch).eq('id', master.id)
        if (error) { console.error(`마스터 ${master.id} 필드 보완 실패:`, error.message); continue }
      }
      for (const dup of duplicates) {
        const { error: lotErr } = await supabase.from('reagent_lots')
          .update({ reagent_id: master.id, location_id: dup.location_id })
          .eq('reagent_id', dup.id)
        if (lotErr) { console.error(`Lot 재소속 실패 (${dup.id} → ${master.id}):`, lotErr.message); continue }

        for (const table of FK_TABLES) {
          const { error: fkErr } = await supabase.from(table).update({ reagent_id: master.id }).eq('reagent_id', dup.id)
          if (fkErr) console.error(`${table} FK 재포인팅 실패 (${dup.id}):`, fkErr.message)
        }

        const { error: delErr } = await supabase.from('reagents').delete().eq('id', dup.id)
        if (delErr) console.error(`중복 reagents 삭제 실패 (${dup.id}):`, delErr.message)
      }
    }
  }

  console.log('')
  console.log(`삭제(병합으로 흡수)될 reagents row: ${deletionLog.length}개 — 목록 저장: scripts/deletion-report.csv`)
  const csvHeader = 'group_name,deleted_id,deleted_cas,deleted_company,deleted_lot_no,master_id,master_cas,master_company'
  const csvRows = deletionLog.map(d => [d.group_name, d.deleted_id, d.deleted_cas, d.deleted_company, d.deleted_lot_no, d.master_id, d.master_cas, d.master_company]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  writeFileSync(new URL('./deletion-report.csv', import.meta.url), [csvHeader, ...csvRows].join('\n'), 'utf-8')

  console.log('')
  console.log(`CAS 번호가 그룹 내에서 서로 다른 의심 사례(자동 병합에서 건너뜀): ${suspicious.length}건`)
  suspicious.forEach(s => console.log(`  - "${s.name}": CAS ${JSON.stringify(s.casValues)}`))
  if (suspicious.length > 0) console.log('  → 이 그룹들은 서로 다른 물질/수화물일 수 있어 병합하지 않았어요. 확인 후 필요하면 개별적으로 정리해주세요.')

  if (!EXECUTE) {
    console.log('')
    console.log('드라이런 완료. 실제 반영하려면: node scripts/consolidate-reagent-masters.mjs --execute')
  } else {
    console.log('')
    console.log('실행 완료. 검증 중...')
    const { count: reagentsCount } = await supabase.from('reagents').select('*', { count: 'exact', head: true }).neq('status', 'archived')
    const { count: lotsCount } = await supabase.from('reagent_lots').select('*', { count: 'exact', head: true })
    console.log(`최종 reagents(비archived) 수: ${reagentsCount}`)
    console.log(`최종 reagent_lots 수: ${lotsCount}`)
  }
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
