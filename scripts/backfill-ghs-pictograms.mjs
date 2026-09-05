// CAS 번호가 있는 기존 시약들의 GHS 픽토그램(ghs_pictograms)/유해정보(hazard)를
// 국가유해물질정보(KECO) GHS 조회 API로 일괄 채운다.
//
// 지금까지는 이 조회가 시약상세 페이지를 "열 때"만 백그라운드로 실행돼서(ReagentDetail.jsx
// enrichCasAndHazard), 한 번도 상세페이지를 열어본 적 없는 시약은 ghs_pictograms가 비어있다.
// "인화성만 보기" 필터가 카탈로그 전체에서 제대로 동작하려면 CAS 있는 시약을 전부 한 번씩
// 조회해서 채워둬야 한다. hazard가 이미 있는 시약은(수동입력 등) 값을 덮어쓰지 않는다.
//
// 공공데이터포털 API라 호출 간 텀을 둠(요청 폭주 방지). 1,000여 건 기준 몇 분 소요 예상.
//
// 사용법: node scripts/backfill-ghs-pictograms.mjs [--execute]

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

const GHS_KEY = 'e9bf2e5bc508d370a9660687c34a6730eae5237e78bad04e08f66705be15d597'
const DELAY_MS = 250

const sleep = ms => new Promise(res => setTimeout(res, ms))

async function fetchGhs(casNo) {
  const url = `https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList?serviceKey=${GHS_KEY}&searchGubun=2&searchNm=${encodeURIComponent(casNo)}&pageNo=1&numOfRows=1&returnType=JSON`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const items = data?.body?.items
  const first = Array.isArray(items) ? items[0] : items
  if (!first) return null
  const hazard = first.hrmflnList ? first.hrmflnList.map(h => h.hrmflnClsfArtclNm).join(', ') : ''
  const pictograms = first.pctgrmCd || ''
  return { hazard, pictograms }
}

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 ===')
  const { data: reagents, error } = await supabase
    .from('reagents')
    .select('id, name, cas_no, hazard, ghs_pictograms')
    .not('cas_no', 'is', null)
    .is('ghs_pictograms', null)
    .neq('status', 'archived')
    .limit(5000)
  if (error) throw error

  console.log(`대상: CAS 있고 ghs_pictograms 비어있는 시약 ${reagents.length}건`)

  let filled = 0, noData = 0, failed = 0
  for (const [i, r] of reagents.entries()) {
    try {
      const result = await fetchGhs(r.cas_no)
      if (!result) {
        noData++
      } else {
        filled++
        if (EXECUTE) {
          const update = { ghs_pictograms: result.pictograms }
          if (!r.hazard && result.hazard) { update.hazard = result.hazard; update.hazard_source = 'auto_ghs' }
          const { error: upErr } = await supabase.from('reagents').update(update).eq('id', r.id)
          if (upErr) { failed++; filled--; console.error(`${r.name}(${r.cas_no}) 저장 실패:`, upErr.message) }
        }
      }
    } catch (e) {
      failed++
      console.error(`${r.name}(${r.cas_no}) 조회 실패:`, e.message)
    }
    if ((i + 1) % 100 === 0) console.log(`${i + 1}/${reagents.length} 처리중...`)
    await sleep(DELAY_MS)
  }

  console.log(`\n결과 — 채움: ${filled} / 데이터없음: ${noData} / 실패: ${failed}`)
  if (!EXECUTE) console.log('드라이런 완료. 실제 반영하려면 --execute')
  else console.log('완료.')
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
