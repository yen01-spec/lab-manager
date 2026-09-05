// backfill-ghs-pictograms.mjs와 같은 KECO GHS API를 다시 조회해서, 이번엔
// hrmflnList(유해분류 이름/H코드/등급/예방조치문구 배열)를 hazard_classifications에
// 구조 그대로 저장한다. "인화성만 보기"처럼 유해분류 이름 기준 필터/조회를 위함.
// hazard/ghs_pictograms는 이미 backfill-ghs-pictograms.mjs로 채워졌어도 그대로 두고
// (덮어쓰지 않음), hazard_classifications만 비어있으면 채운다.
//
// 사용법: node scripts/backfill-hazard-classifications.mjs [--execute]

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

async function fetchClassifications(casNo) {
  const url = `https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList?serviceKey=${GHS_KEY}&searchGubun=2&searchNm=${encodeURIComponent(casNo)}&pageNo=1&numOfRows=1&returnType=JSON`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const items = data?.body?.items
  const first = Array.isArray(items) ? items[0] : items
  if (!first) return null
  return (first.hrmflnList || []).map(h => ({
    name: h.hrmflnClsfArtclNm, hCode: h.hrmDngrCd, grade: h.clsfGrd,
    pCodes: h.hrmPrevntCd ? h.hrmPrevntCd.split('^') : [],
  }))
}

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 ===')
  const { data: reagents, error } = await supabase
    .from('reagents')
    .select('id, name, cas_no, hazard_classifications')
    .not('cas_no', 'is', null)
    .is('hazard_classifications', null)
    .neq('status', 'archived')
    .limit(5000)
  if (error) throw error

  console.log(`대상: CAS 있고 hazard_classifications 비어있는 시약 ${reagents.length}건`)

  let filled = 0, noData = 0, failed = 0
  for (const [i, r] of reagents.entries()) {
    try {
      const classifications = await fetchClassifications(r.cas_no)
      if (!classifications || classifications.length === 0) {
        noData++
      } else {
        filled++
        if (EXECUTE) {
          const { error: upErr } = await supabase.from('reagents').update({ hazard_classifications: classifications }).eq('id', r.id)
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
