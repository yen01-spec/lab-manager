// 2026-2 전수조사 "최종결과본" 시트의 "알파벳"(시약장 알파벳 정렬 기준) 컬럼을
// reagents.sort_letter에 채워넣는다. import-inventory-2026-2.mjs와 동일한 그룹핑
// 키(정규화 영문명+순도+제조사+용량+단위)로 파일 행 -> 시약 마스터를 다시 연결한다.
//
// 주의: 이후 수화물 표기 표준화(fix-hydrate-names)로 이름이 바뀐 9건은 파일의 원래
// 영문명과 DB 현재 이름이 달라져서 이 매칭에서 빠질 수 있음(허용 범위로 봄).
//
// 사용법: node scripts/backfill-sort-letter.mjs [--execute]

import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

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

function normalize(s) {
  return (s || '').toString().normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}
function blankDash(s) {
  const v = (s ?? '').toString().trim()
  return v === '' || v === '-' ? null : v
}
function parseVolume(raw) {
  const v = (raw || '').toString().normalize('NFKC').trim()
  if (!v || v === '-') return { volume: null, unit: null }
  const m = v.match(/^([\d.]+)\s*(.*)$/)
  if (!m) return { volume: null, unit: v }
  const num = parseFloat(m[1])
  if (isNaN(num)) return { volume: null, unit: v }
  return { volume: num, unit: m[2].trim() || null }
}
function groupKey({ nameEn, purity, company, volume, unit }) {
  return [normalize(nameEn), (purity || '').trim().toLowerCase(), (company || '').trim().toLowerCase(), volume, (unit || '').trim().toLowerCase()].join('|')
}

async function fetchAllReagents() {
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase.from('reagents').select('id, name, purity, company, volume, unit').neq('status', 'archived').range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  const wb = XLSX.readFile(FILE)
  const raw = XLSX.utils.sheet_to_json(wb.Sheets['최종결과본'], { header: 1, defval: '' })
  // 컬럼 순서/여백열이 파일 정리 과정에서 바뀔 수 있어(실제로 한 번 바뀜 — "임시단수"
  // 컬럼과 맨 앞 여백열이 사라짐) 고정 인덱스 대신 헤더 이름으로 컬럼을 찾는다.
  const headerRowIdx = raw.findIndex(r => r.some(c => String(c).trim() === '번호'))
  if (headerRowIdx < 0) throw new Error('헤더 행을 못 찾음 — 시트 구조 확인 필요')
  const headerRow = raw[headerRowIdx].map(c => String(c).trim())
  const col = name => {
    const idx = headerRow.indexOf(name)
    if (idx < 0) throw new Error(`컬럼 "${name}"을 헤더에서 못 찾음`)
    return idx
  }
  const IDX = { nameEn: col('영문 시약명'), purity: col('순도'), company: col('제조사'), volume: col('용량(단위)'), letter: col('알파벳') }
  const dataRows = raw.slice(headerRowIdx + 1).filter(r => String(r[col('국문시약명')] || '').trim())

  const nfkc = v => (v === undefined || v === null) ? v : v.toString().normalize('NFKC')
  const fileKeyToLetter = new Map()
  for (const r of dataRows) {
    const nameEn = nfkc(r[IDX.nameEn]), purity = blankDash(nfkc(r[IDX.purity])), company = blankDash(nfkc(r[IDX.company]))
    const { volume, unit } = parseVolume(r[IDX.volume])
    const letter = blankDash(nfkc(r[IDX.letter]))
    if (!letter) continue
    const key = groupKey({ nameEn, purity, company, volume, unit })
    if (!fileKeyToLetter.has(key)) fileKeyToLetter.set(key, letter)
  }
  console.log(`파일 기준 그룹 수: ${fileKeyToLetter.size}`)

  const reagents = await fetchAllReagents()
  const updates = []
  let unmatched = 0
  for (const r of reagents) {
    const key = groupKey({ nameEn: r.name, purity: r.purity, company: r.company, volume: r.volume, unit: r.unit })
    const letter = fileKeyToLetter.get(key)
    if (letter) updates.push({ id: r.id, sort_letter: letter })
    else unmatched++
  }
  console.log(`DB 시약 ${reagents.length}개 중 매칭: ${updates.length} / 미매칭: ${unmatched}`)

  if (!EXECUTE) {
    console.log('\n드라이런 완료. 실제 반영하려면 --execute')
    return
  }
  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200)
    await Promise.all(batch.map(u => supabase.from('reagents').update({ sort_letter: u.sort_letter }).eq('id', u.id)))
    console.log(`${Math.min(i + 200, updates.length)}/${updates.length} 반영...`)
  }
  console.log('완료.')
}

main().catch(e => { console.error('실패:', e); process.exit(1) })
