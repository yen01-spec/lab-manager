// 강원대 연구실안전관리시스템 화학물질정보 마스터(RegChemicalSample.xlsx 시트2) 임포트.
// 17,485행 전체를 school_chemical_master에 채워 넣는다. CAS가 전부 유일함을 미리 확인함
// (check_dupe_cas.js) — upsert 대신 매번 통째로 비우고 다시 넣는다(학교가 갱신본을 주면
// 그대로 재실행하면 되도록).
//
// 사용법: node scripts/import-school-chemical-master.mjs <xlsx경로> [--execute]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const XLSX = createRequire(import.meta.url)('xlsx')

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
const xlsxPath = process.argv.find(a => a.endsWith('.xlsx'))

if (!xlsxPath) {
  console.error('사용법: node scripts/import-school-chemical-master.mjs <xlsx경로> [--execute]')
  process.exit(1)
}

function parseDate(v) {
  if (!v) return null
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return null
}

async function main() {
  console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 ===')
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets['화학물질정보']
  if (!ws) throw new Error('"화학물질정보" 시트를 찾을 수 없습니다')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1)

  const records = rows
    .filter(r => String(r[1]).trim())
    .map(r => ({
      name: String(r[0]).trim(),
      cas_no: String(r[1]).trim(),
      unit: String(r[2]).trim(),
      category_class: String(r[3]).trim() || null,
      characteristics: String(r[4]).trim() || null,
      registered_date: parseDate(r[5]),
    }))

  console.log(`대상: ${records.length}건`)
  if (!EXECUTE) { console.log('드라이런 완료. 실제 반영하려면 --execute'); return }

  console.log('기존 테이블 비우는 중...')
  const { error: delErr } = await supabase.from('school_chemical_master').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) throw delErr

  const BATCH = 500
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase.from('school_chemical_master').insert(batch)
    if (error) throw error
    console.log(`${Math.min(i + BATCH, records.length)}/${records.length} 삽입됨`)
  }
  console.log('완료.')
}

main().catch(e => { console.error('스크립트 실패:', e); process.exit(1) })
