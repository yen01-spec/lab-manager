// READ ONLY against production. Production Gate P0 §11/§12 — exports the current
// active inventory in the same "inventory snapshot" Excel format the app itself
// produces/consumes (src/lib/inventorySnapshotExcel.js + inventorySnapshotMatch.js),
// then round-trips the just-written file back through the REAL parse/match engine
// (not a reimplementation) to verify it reconciles exactly with the DB it came from.
//
// Writes ONLY to the given output directory — never into the repo.
// Usage: node scripts/production-inventory-backup.mjs <output-dir>

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from './supabase-refs.mjs'
import { fetchAllPages } from '../src/lib/fetchAllPages.js'
import {
  locationLabel, SNAPSHOT_COLUMNS, DATA_SHEET_NAME, GUIDE_SHEET_NAME,
  parseInventorySnapshotAoa, runGlobalValidation, buildMatchIndexes,
  matchInventorySnapshotRows, rowBucket, computeExcludedLots,
} from '../src/lib/inventorySnapshotMatch.js'

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
const urlRefMatch = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)
const urlRef = urlRefMatch ? urlRefMatch[1] : null
if (!urlRef) throw new Error('[FATAL] .env.local의 VITE_SUPABASE_URL에서 project ref를 못 읽었습니다.')
if (urlRef === STAGING_PROJECT_REF) throw new Error('[FATAL] .env.local이 STAGING을 가리킵니다 — production backup은 .env.local(production)만 사용합니다.')
if (urlRef !== PRODUCTION_PROJECT_REF) throw new Error(`[FATAL] .env.local의 ref(${urlRef})가 PRODUCTION_PROJECT_REF(${PRODUCTION_PROJECT_REF})와 다릅니다.`)
console.log(`[guard] production ref 확인됨: ${urlRef}`)

const outDir = process.argv[2]
if (!outDir) throw new Error('사용법: node scripts/production-inventory-backup.mjs <output-dir>')

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

function isGeneratedLot(lotSource) {
  return typeof lotSource === 'string' && lotSource.startsWith('generated')
}

// src/lib/inventorySnapshotExcel.js의 fetchCurrentSnapshotRows()와 동일 로직(READ ONLY).
async function fetchCurrentSnapshotRows() {
  const [lots, locationsRes] = await Promise.all([
    fetchAllPages((from, to) => supabase.from('reagent_lots')
      .select('id, reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock, location_id, shelf_position, received_date, expiry_date, status, reagents(id, name, name_ko, cas_no, company, purity, volume, unit)')
      .eq('status', 'active').range(from, to)),
    supabase.from('locations').select('id, room, detail'),
  ])
  if (locationsRes.error) throw locationsRes.error
  const locById = new Map((locationsRes.data || []).map((l) => [l.id, l]))
  return lots.filter((l) => l.reagents).map((l) => {
    const r = l.reagents
    const loc = locById.get(l.location_id)
    return {
      nameEn: r.name || '', nameKo: r.name_ko || '', casNo: r.cas_no || '',
      company: r.company || '', catNo: l.cat_no || '', purity: r.purity || '',
      volume: r.volume ?? '', unit: r.unit || '',
      lotNo: l.lot_no || '', lotKind: l.lot_no ? (isGeneratedLot(l.lot_source) ? '내부 관리번호' : '제조사 Lot') : '',
      locationLabel: locationLabel(loc), shelfPosition: l.shelf_position || '',
      receivedDate: l.received_date || '', expiryDate: l.expiry_date || '',
      currentStock: l.current_stock, sealedCount: l.sealed_count,
      note: '',
      reagentId: r.id, lotId: l.id, lotSource: l.lot_source || '',
    }
  })
}

const GUIDE_LINES = [
  ['운영 적용 전 백업 — Production Gate P0 (20260914090000_inventory_snapshot_sync.sql 적용 전)'],
  [],
  ['- 한 행은 실물 시약 1병(Lot)입니다.'],
  ['- __reagent_id / __lot_id / __lot_source는 시스템 식별자입니다. 수정하지 마세요.'],
]

function writeWorkbook(rows, filePath) {
  const header = SNAPSHOT_COLUMNS.map((c) => c.label)
  const aoa = [header, ...rows.map((r) => SNAPSHOT_COLUMNS.map((c) => r[c.key] ?? ''))]
  const dataWs = XLSX.utils.aoa_to_sheet(aoa)
  dataWs['!cols'] = SNAPSHOT_COLUMNS.map((c) => ({ wch: Math.max(c.label.length + 2, 12) }))
  const guideWs = XLSX.utils.aoa_to_sheet(GUIDE_LINES)
  guideWs['!cols'] = [{ wch: 90 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, guideWs, GUIDE_SHEET_NAME)
  XLSX.utils.book_append_sheet(wb, dataWs, DATA_SHEET_NAME)
  XLSX.writeFile(wb, filePath)
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function main() {
  console.log('[1/4] production에서 현재 active 재고 조회 중...')
  const rows = await fetchCurrentSnapshotRows()
  console.log(`  -> ${rows.length}행`)

  const fileName = `inventory_before_sync_migration_${timestamp()}.xlsx`
  const filePath = path.join(outDir, fileName)
  console.log(`[2/4] backup 파일 작성: ${filePath}`)
  writeWorkbook(rows, filePath)

  const stat = statSync(filePath)
  const buf = readFileSync(filePath)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  console.log(`  -> size=${stat.size} bytes, sha256=${sha256}`)

  console.log('[3/4] round-trip: 방금 쓴 파일을 다시 읽어 파싱...')
  const wb2 = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: true })
  const sheetNames = wb2.SheetNames
  const getSheetAoa = (name) => XLSX.utils.sheet_to_json(wb2.Sheets[name], { header: 1, raw: false, defval: '' })
  const parsed = parseInventorySnapshotAoa(sheetNames, getSheetAoa)
  if (parsed.fileError) throw new Error(`round-trip 파싱 실패: ${parsed.fileError}`)
  console.log(`  -> 파싱된 행 수: ${parsed.rows.length}`)

  console.log('[4/4] round-trip: 지금 시점 production DB와 대조...')
  const [reagentsRes, lots, locationsRes] = await Promise.all([
    supabase.from('reagents').select('id, name, name_ko, cas_no, company, purity, volume, unit'),
    fetchAllPages((from, to) => supabase.from('reagent_lots')
      .select('id, reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock, location_id, shelf_position, received_date, expiry_date, status')
      .eq('status', 'active').range(from, to)),
    supabase.from('locations').select('id, room, detail'),
  ])
  if (reagentsRes.error) throw reagentsRes.error
  if (locationsRes.error) throw locationsRes.error
  const reagents = reagentsRes.data
  const locations = locationsRes.data

  runGlobalValidation(parsed.rows)
  const idx = buildMatchIndexes({ reagents, lots, locations })
  const matched = matchInventorySnapshotRows(parsed.rows, idx)
  const buckets = { unchanged: 0, changed: 0, new: 0, review: 0, error: 0 }
  const errorDetails = []
  const changedDetails = []
  for (const row of matched) {
    const b = rowBucket(row)
    buckets[b] += 1
    if (b === 'error') errorDetails.push({ rowNo: row.rowNo, errors: row.errors })
    if (b === 'changed') changedDetails.push({ rowNo: row.rowNo, lotId: row.lotIdRaw })
  }
  const excluded = computeExcludedLots(lots, matched)

  const summary = {
    filePath, fileName, sizeBytes: stat.size, sha256,
    exportedRowCount: rows.length,
    roundTripParsedRowCount: parsed.rows.length,
    freshActiveLotCount: lots.length,
    buckets, excludedCount: excluded.length,
    errorDetails, changedDetails,
  }
  writeFileSync(path.join(outDir, 'backup-summary.json'), JSON.stringify(summary, null, 2))
  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => { console.error('[FATAL]', e); process.exitCode = 1 })
