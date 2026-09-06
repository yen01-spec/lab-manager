// 시약 카탈로그 전체를 대상으로 "CAS 번호가 실제로 이 시약명이 맞는 물질의 CAS인가"를
// PubChem 동의어 목록과 대조해서 검증한다. 44종 특별관리물질 교차검증
// (specialManagementSubstances.js)과 달리 CAS가 있는 시약 전부를 대상으로 함.
//
// 이름 매칭 설계 교훈(specialManagementSubstances.js에서 겪은 문제) 반영:
// 그때는 "44개 고정 이름 vs 1,500개 후보"로 넓게 검색하다가 니트로벤젠처럼 모체
// 이름을 포함한 무관한 유도체가 대량 오탐됐음. 이번엔 반대로 "이 CAS 하나의 공식
// 동의어 목록(보통 수십~백여 개) vs 이 시약 하나의 이름"만 1:1로 비교하는 구조라서
// 그런 조합 폭발이 없음 — 그래도 동의어 목록엔 EC번호·DTXSID 같은 짧은 코드가 섞여
// 있어 4자 이하 토큰은 매칭에서 제외한다.
//
// 사용법: node scripts/verify-cas-consistency.mjs [--execute] [--limit N] [--only-unverified]
// --only-unverified: cas_verification_status가 아직 null인(한 번도 처리 안 됐거나, PubChem
// 503 등으로 조회 자체가 실패해 기록되지 못한) 시약만 대상으로 함 — 매번 전체를 다시
// 돌리지 않고 실패분만 재시도하거나, 새로 등록된 시약만 증분 검증할 때 사용.

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
const ONLY_UNVERIFIED = process.argv.includes('--only-unverified')
const limitArg = process.argv.find(a => a.startsWith('--limit'))
const LIMIT = limitArg ? Number(process.argv[process.argv.indexOf(limitArg) + 1] ?? limitArg.split('=')[1]) : 5000

const DELAY_MS = 350

const sleep = ms => new Promise(res => setTimeout(res, ms))

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

function nameMatchesSynonyms(reagentName, synonyms) {
  const rn = normalize(reagentName)
  if (!rn || rn.length <= 4) return { matched: false }
  for (const syn of synonyms) {
    const sn = normalize(syn)
    if (sn.length <= 4) continue
    if (rn === sn || rn.includes(sn) || sn.includes(rn)) return { matched: true, synonym: syn }
  }
  return { matched: false }
}

async function fetchSynonyms(casNo, attempt = 1) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(casNo)}/synonyms/JSON`
  const res = await fetch(url)
  if (res.status === 404) return null // PubChem이 이 CAS를 아예 모름
  if (res.status === 429 && attempt <= 3) { await sleep(2000 * attempt); return fetchSynonyms(casNo, attempt + 1) }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const info = data?.InformationList?.Information?.[0]
  return info?.Synonym || []
}

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 (결과만 출력, DB 저장 안 함) ===')
  let query = supabase
    .from('reagents')
    .select('id, name, cas_no')
    .not('cas_no', 'is', null)
    .neq('status', 'archived')
  if (ONLY_UNVERIFIED) query = query.is('cas_verification_status', null)
  const { data: reagents, error } = await query.limit(LIMIT)
  if (error) throw error

  console.log(`대상: CAS 있는 시약 ${reagents.length}건${ONLY_UNVERIFIED ? ' (미검증만)' : ''}`)

  let ok = 0, mismatch = 0, notFound = 0, failed = 0
  const mismatches = []
  for (const [i, r] of reagents.entries()) {
    try {
      const synonyms = await fetchSynonyms(r.cas_no)
      let status, note
      if (synonyms === null) {
        status = 'not_found'; note = null; notFound++
      } else {
        const { matched, synonym } = nameMatchesSynonyms(r.name, synonyms)
        if (matched) {
          status = 'ok'; note = synonym; ok++
        } else {
          status = 'mismatch'
          note = synonyms.filter(s => !/^\d+$/.test(s)).slice(0, 3).join(', ')
          mismatch++
          mismatches.push({ name: r.name, cas: r.cas_no, actual: note })
        }
      }
      if (EXECUTE) {
        const { error: upErr } = await supabase.from('reagents').update({ cas_verification_status: status, cas_verification_note: note }).eq('id', r.id)
        if (upErr) { failed++; console.error(`${r.name}(${r.cas_no}) 저장 실패:`, upErr.message) }
      }
    } catch (e) {
      failed++
      console.error(`${r.name}(${r.cas_no}) 조회 실패:`, e.message)
    }
    if ((i + 1) % 50 === 0) console.log(`${i + 1}/${reagents.length} 처리중... (일치 ${ok} / 불일치 ${mismatch} / 없음 ${notFound} / 실패 ${failed})`)
    await sleep(DELAY_MS)
  }

  console.log(`\n결과 — 일치: ${ok} / 불일치(의심): ${mismatch} / PubChem에 없음: ${notFound} / 조회실패: ${failed}`)
  if (mismatches.length > 0) {
    console.log('\n불일치 목록:')
    mismatches.forEach(m => console.log(`- "${m.name}" (CAS ${m.cas}) → PubChem: ${m.actual}`))
  }
  if (!EXECUTE) console.log('\n드라이런 완료. 실제 반영하려면 --execute')
  else console.log('\n완료.')
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
