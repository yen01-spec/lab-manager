// 2026-2 전수조사 데이터를 reagents/reagent_lots로 변환해 DB에 반영하는 스크립트.
// (2026-09-11 파일 구조가 크게 바뀌어서 전면 재작성함 — 이전 버전은 git 이력 참고)
//
// 원본: "C:\Users\user\Desktop\2026-2 시약정리 결과 요약\최종 결과본.xlsx"의 `최종결과본` 시트
// (같은 폴더의 `최종 결과본_시약장별 분류.xlsx`는 같은 데이터를 캐비닛별로 다시 쪼갠
// 보기용 파일이라 임포트 대상 아님).
//
// 규칙(사용자와 합의한 내용):
// - 파일의 한 행 = Lot 1개(물리적 병 1개). 잔량 100% → 미개봉 1병(sealed_count=1,
//   current_stock=0), 100% 미만 → 개봉중(sealed_count=0, current_stock=그 값).
// - 시약 마스터 그룹핑 키 = (정규화된 영문명, 순도, 제조사, 용량+단위) 전부 일치하는
//   행들만 한 마스터의 여러 Lot으로 묶음. 하나라도 다르면 별도 마스터. "여분시약" 통합
//   기준(국문+영문+CAS만 같으면 동일 취급)은 물리적 재고 정리용이지 DB 마스터 그룹핑
//   기준이 아님(사용자 확인) — 위치는 어차피 Lot 단위라 서로 다른 마스터가 같은
//   "여분의 시약장"에 있어도 무방.
// - "시약장" 컬럼(최종 목적지)이 곧 location — "5층 배기형 시약장"만 번호(1~4)+좌우까지
//   구분(번호는 기존 location 그대로, 좌우는 reagent_lots.shelf_position). 나머지
//   (303-1 냉장시약장, 303 노란시약장 등)는 좌우 구분 없이 기존 location 그대로 사용.
//   "여분의 시약장"은 "5층 여분의 시약장"라는 새 location으로 처리(2026-09-11 추가).
// - "단수" 컬럼이 실제 세부위치 DB 반영 대상(현재 전부 공란 — 다음 전수조사 때 채워짐).
//   "임시단수"는 엑셀 정리용 참고 컬럼이라 DB에 넣지 않음.
// - "303 노란 시약장"(좌우 미지정, 신규 에틸알코올 2병)은 우측으로 확정.
// - "5층 기타시약"은 이번 임포트에서 제외(최종결과본 시트에 이미 안 들어있음).
// - "CAS.No 확인 필요" 탭의 "2. 조치 필요"(23건, CAS 불확실)는 번호+국문명으로 매칭해
//   해당 Lot에 needs_action=true/action_note로 표시. "1. 수정 완료"는 이미 최종결과본에
//   반영된 값이라 별도 처리 불필요.
// - 이번 파일엔 이전의 수정이력/검토의견 같은 촘촘한 감사기록이 없어 reagent_import_history는
//   채우지 않음(테이블 자체는 남겨둠 — 다음에 비슷한 자료 있으면 재사용).
// - 기존 DB의 reagents는 실사용 이력이 없는 테스트 데이터라 전부 삭제하고 새로 구축한다.
//
// 사용법: node scripts/import-inventory-2026-2.mjs [--execute]

import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

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

const FILE = String.raw`C:\Users\user\Desktop\2026-2 시약정리 결과 요약\최종 결과본.xlsx`

// 기존 locations 테이블 id + 이번에 새로 추가한 "5층 여분의 시약장"(2026-09-11).
const LOC = {
  bond5f_1: '0caec55f-6abf-43f9-81d2-936dc4afc452',
  bond5f_2: 'a2955cce-32b8-4981-8a83-95af6b2f3c50',
  bond5f_3: '60fa5d85-3101-4349-ba27-b3ef0d97647c',
  bond5f_4: '86ced833-1d8f-44bc-b31c-0d8cd6b20c37',
  acidbase5f: 'b18f7ab4-dbbd-475b-9d57-917d81840860',
  yellow5f: '832af21b-fa80-4efc-94b0-bc94375fac63',
  yellow303_l: 'a9586e5c-c68a-4b01-afcd-922e32c4da7e',
  yellow303_r: '7c316ad2-b163-4fa7-8999-4795146aca12',
  vent3031: '09b6215c-5a01-4786-96c7-3121945d64a2',
  buffer3031: 'b646a5a9-224b-431f-9b95-e24f014baae3',
  fridge3031: '61483a4c-9b0b-429b-b366-cd09253c5794',
  spare5f: '09b932a1-1cf5-440c-b018-6ec126df396a',
}

// 전각(１ｋｇ 등) 문자를 반각으로 정규화(NFKC)한 뒤 비교 — 이전 파일의 "전각" 정리
// 항목처럼, 같은 이름인데 숫자/문자가 전각으로 섞여 들어오면 그룹핑이 어긋날 수 있어서.
// 원본 엑셀에서 "값 없음"을 "-"로 표기하는 관례가 있어서(CAS/순도/제조사/Cat.No/Lot.No 등),
// 그대로 저장하면 실제 문자열 "-"가 DB에 남아 "값이 있다"로 오인됨 — 전부 null로 취급.
function blankDash(s) {
  const v = (s ?? '').toString().trim()
  return v === '' || v === '-' ? null : v
}

function normalize(s) {
  return (s || '').toString().normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

// "시약장" 컬럼(예: "5층 배기형 시약장 2번 좌측")을 {location_id, shelf_position}로 변환.
function resolveLocation(sigyakjang) {
  const v = (sigyakjang || '').trim()
  if (v === '여분의 시약장') return { location_id: LOC.spare5f, shelf_position: null }
  if (v === '303-1 밀폐형 환기 시약장') return { location_id: LOC.vent3031, shelf_position: null }
  if (v.startsWith('303-1 냉장 시약장')) return { location_id: LOC.fridge3031, shelf_position: null }
  if (v === '303-1 버퍼&지시약 시약장') return { location_id: LOC.buffer3031, shelf_position: null }
  if (v === '5층 산염기 시약장') return { location_id: LOC.acidbase5f, shelf_position: null }
  if (v.startsWith('5층 배기형 시약장')) {
    const m = v.match(/([1-4])번(?:\s*(좌측|우측))?/)
    if (!m) return null
    return { location_id: LOC['bond5f_' + m[1]], shelf_position: m[2] || null }
  }
  if (v === '303 노란 시약장 좌측') return { location_id: LOC.yellow303_l, shelf_position: null }
  if (v === '303 노란 시약장 우측') return { location_id: LOC.yellow303_r, shelf_position: null }
  // 좌우 미지정 채로 남은 신규 에틸알코올 2병 — 사용자 확정: 우측으로.
  if (v === '303 노란 시약장') return { location_id: LOC.yellow303_r, shelf_position: null }
  return null
}

// "25g" -> {volume: 25, unit: 'g'}. "-"/빈칸은 둘 다 null.
// normalize('NFKC')로 전각(１ｋｇ 등) 문자를 일반 반각 문자로 변환한 뒤 파싱.
function parseVolume(raw) {
  const v = (raw || '').toString().normalize('NFKC').trim()
  if (!v || v === '-') return { volume: null, unit: null }
  const m = v.match(/^([\d.]+)\s*(.*)$/)
  if (!m) return { volume: null, unit: v }
  const num = parseFloat(m[1])
  if (isNaN(num)) return { volume: null, unit: v }
  return { volume: num, unit: m[2].trim() || null }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchAllOldReagents() {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('reagents').select('id').neq('status', 'archived').range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

function sheetRows(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
}

async function main() {
  const wb = XLSX.readFile(FILE)

  // ── 1. `최종결과본` 파싱 — 헤더는 15행(0-index), col0은 항상 빈 스페이서 열 ──
  const raw = sheetRows(wb, '최종결과본')
  const headerIdx = raw.findIndex(r => String(r[2]).trim() === '번호')
  if (headerIdx < 0) throw new Error('헤더 행("번호")을 못 찾음 — 시트 구조가 또 바뀐 것 같음')
  const dataRows = raw.slice(headerIdx + 1).filter(r => String(r[3] || '').trim()) // 국문시약명 있는 행만

  // 전각 문자가 값 전체에 섞여 들어올 수 있어(예: 용량 "１ｋｇ") 문자열 필드는 전부
  // NFKC로 반각 정규화한 뒤 사용 — 숫자/CAS 등도 마찬가지.
  const nfkc = v => (v === undefined || v === null) ? v : v.toString().normalize('NFKC')

  const report = { locationMisses: [], volumeParseFails: [], actionMatched: 0, actionUnmatched: [] }
  const lotCandidates = []
  dataRows.forEach((r, i) => {
    const [, , num, nameKoRaw, nameEnRaw, , purityRaw, casRaw, companyRaw, catNoRaw, lotNoRaw, categoryRaw, volumeRaw, remainPct, noteRaw, , registeredByRaw, , , sigyakjangRaw, , , receivedDateRaw] = r
    const nameKo = nfkc(nameKoRaw), nameEn = nfkc(nameEnRaw), purity = nfkc(purityRaw), cas = nfkc(casRaw)
    const company = nfkc(companyRaw), catNo = nfkc(catNoRaw), lotNo = nfkc(lotNoRaw), category = nfkc(categoryRaw)
    const note = nfkc(noteRaw), registeredBy = nfkc(registeredByRaw), sigyakjang = nfkc(sigyakjangRaw), receivedDate = nfkc(receivedDateRaw)
    const { volume, unit } = parseVolume(volumeRaw)
    if (volumeRaw && volumeRaw !== '-' && volume === null) report.volumeParseFails.push({ nameEn, volumeRaw })
    const locResolved = resolveLocation(sigyakjang)
    if (!locResolved) report.locationMisses.push({ rowIndex: headerIdx + 2 + i, nameEn, sigyakjang })
    lotCandidates.push({
      num, nameKo: blankDash(nameKo), nameEn, purity: blankDash(purity), cas: blankDash(cas),
      company: blankDash(company), catNo: blankDash(catNo), lotNo: blankDash(lotNo), category: blankDash(category),
      volume, unit, volumeRaw, remainPct: Number(remainPct) || 0, note: blankDash(note),
      registeredBy: blankDash(registeredBy), locResolved, sigyakjang,
      receivedDate: blankDash(receivedDate),
    })
  })

  // ── 2. 마스터 그룹핑: (정규화 영문명, 순도, 제조사, 용량+단위) ──────────
  const groups = new Map()
  for (const c of lotCandidates) {
    const key = [normalize(c.nameEn), (c.purity || '').trim().toLowerCase(), (c.company || '').trim().toLowerCase(), c.volume, (c.unit || '').trim().toLowerCase()].join('|')
    if (!groups.has(key)) groups.set(key, { meta: c, lots: [] })
    groups.get(key).lots.push(c)
  }

  // ── 3. "CAS.No 확인 필요" > "2. 조치 필요" 매칭 (번호+국문명 정규화) ──────
  const casSheetRows = sheetRows(wb, 'CAS.No 확인 필요')
  const section2Start = casSheetRows.findIndex(r => String(r[0]).includes('조치 필요'))
  const actionItems = []
  if (section2Start >= 0) {
    for (let i = section2Start + 2; i < casSheetRows.length; i++) { // +2: 섹션 제목 다음이 서브헤더
      const r = casSheetRows[i]
      if (!r[0] && !r[1]) continue
      const [num, nameKo, nameEn, existingValue, note] = r
      actionItems.push({ num, nameKo, note: `CAS 확인필요 — 기재값 "${existingValue}": ${note}`, nameEn })
    }
  }
  const byNumName = new Map()
  for (const [gk, g] of groups) {
    for (const lot of g.lots) {
      const key = `${lot.num}|${normalize(lot.nameKo)}`
      if (!byNumName.has(key)) byNumName.set(key, [])
      byNumName.get(key).push({ gk, lot })
    }
  }
  for (const item of actionItems) {
    const key = `${item.num}|${normalize(item.nameKo)}`
    const matches = byNumName.get(key)
    if (!matches || matches.length === 0) { report.actionUnmatched.push(`${item.num}|${item.nameKo}`); continue }
    matches.forEach(({ lot }) => { lot._actionNote = item.note })
    report.actionMatched++
  }

  // ── 4. 기존 DB 전체 삭제 대상 (사용자 확인: 실사용 이력 없는 테스트 데이터) ──
  const oldReagents = await fetchAllOldReagents()
  const oldIdsToDelete = new Set(oldReagents.map(r => r.id))

  // ── 리포트 출력 ──────────────────────────────────────────────────────
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 (DB 변경 없음) ===')
  console.log(`대상 행: ${lotCandidates.length}건 → 시약 마스터 ${groups.size}개, Lot ${lotCandidates.length}개`)
  console.log(`위치 매칭 실패: ${report.locationMisses.length}건`)
  report.locationMisses.slice(0, 20).forEach(m => console.log(`  - 행${m.rowIndex} ${m.nameEn} · 시약장="${m.sigyakjang}"`))
  console.log(`용량 파싱 실패: ${report.volumeParseFails.length}건`)
  report.volumeParseFails.slice(0, 20).forEach(m => console.log(`  - ${m.nameEn} · 용량="${m.volumeRaw}"`))
  console.log(`\nCAS 조치필요 매칭: ${report.actionMatched}건 매칭 / ${report.actionUnmatched.length}건 미매칭 (총 ${actionItems.length}건)`)
  report.actionUnmatched.forEach(k => console.log(`  - 미매칭: ${k}`))
  console.log(`\n기존 DB 시약 ${oldReagents.length}개 전부 삭제 후 새 데이터로 재구축`)

  const reportPath = String.raw`C:\Users\user\AppData\Local\Temp\claude\C--Users-user\9f714aa7-7a76-4c29-b152-c8a111b37c03\scratchpad\import-report.json`
  writeFileSync(reportPath, JSON.stringify({ groupCount: groups.size, lotCount: lotCandidates.length, report }, null, 2))
  console.log('\n상세 리포트:', reportPath)

  if (!EXECUTE) {
    console.log('\n드라이런 완료. 실제 반영하려면 --execute')
    return
  }

  // ── 실제 반영 ──────────────────────────────────────────────────────
  const occurredAt = new Date().toISOString()
  const deleteIds = [...oldIdsToDelete]

  console.log(`\n[1/5] 기존 시약 ${deleteIds.length}개에 연결된 테스트성 기록 정리 중...`)
  for (const idsChunk of chunk(deleteIds, 200)) {
    await supabase.from('purchase_request_reagent_items').update({ reagent_id: null }).in('reagent_id', idsChunk)
    await supabase.from('reagent_lots').delete().in('reagent_id', idsChunk)
    await supabase.from('reagent_change_requests').delete().in('reagent_id', idsChunk)
    await supabase.from('disposal_requests').delete().in('reagent_id', idsChunk)
    await supabase.from('location_history').delete().in('reagent_id', idsChunk)
    await supabase.from('special_material_logs').delete().in('reagent_id', idsChunk)
    await supabase.from('reagent_import_history').delete().in('reagent_id', idsChunk)
  }

  console.log(`[2/5] 기존 시약 ${deleteIds.length}개 삭제 중...`)
  for (const idsChunk of chunk(deleteIds, 200)) {
    const { error } = await supabase.from('reagents').delete().in('id', idsChunk)
    if (error) throw error
  }

  console.log(`[3/5] 새 시약 마스터 ${groups.size}개 삽입 중...`)
  const groupKeys = [...groups.keys()]
  const gkToReagentId = new Map()
  for (const gksChunk of chunk(groupKeys, 200)) {
    const payload = gksChunk.map(gk => {
      const m = groups.get(gk).meta
      return {
        name: m.nameEn, name_ko: m.nameKo || null, cas_no: m.cas || null, company: m.company || null,
        purity: m.purity || null, category: m.category || null,
        volume: m.volume, unit: m.unit || null,
        reagent_type: 'purchased', status: 'active', last_confirmed_at: occurredAt,
      }
    })
    const { data, error } = await supabase.from('reagents').insert(payload).select('id')
    if (error) throw error
    data.forEach((row, i) => gkToReagentId.set(gksChunk[i], row.id))
  }

  console.log(`[4/5] Lot ${lotCandidates.length}개 삽입 중...`)
  const lotPayload = []
  for (const [gk, g] of groups) {
    const reagentId = gkToReagentId.get(gk)
    for (const lot of g.lots) {
      const unopened = lot.remainPct >= 100
      lotPayload.push({
        reagent_id: reagentId, location_id: lot.locResolved?.location_id || null, shelf_position: lot.locResolved?.shelf_position || null,
        lot_no: lot.lotNo || null, cat_no: lot.catNo || null,
        sealed_count: unopened ? 1 : 0, current_stock: unopened ? 0 : lot.remainPct,
        received_date: lot.receivedDate, status: 'active', registered_by_name: lot.registeredBy || null,
        needs_action: !!lot._actionNote, action_note: lot._actionNote || null,
      })
    }
  }
  for (const payloadChunk of chunk(lotPayload, 300)) {
    const { error } = await supabase.from('reagent_lots').insert(payloadChunk)
    if (error) throw error
  }

  console.log(`[5/5] 완료. 시약 마스터 ${groups.size}개 · Lot ${lotCandidates.length}개 삽입, 기존 시약 ${deleteIds.length}개 삭제.`)
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
