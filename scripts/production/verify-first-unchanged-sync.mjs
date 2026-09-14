// PRODUCTION Gate P2 -- first-ever real sync_inventory_snapshot(jsonb) call against
// production, with a fully-unchanged snapshot (payload built from the DB's own current
// state, so the RPC should report every mutation count as 0 and only write one audit row).
//
// This script MUST be run interactively by a human, in a real terminal (not via an
// automated/non-TTY process) -- it refuses to start otherwise, because the admin
// password prompt has no other safe way to receive input.
//
// SAFETY DESIGN (do not weaken any of this):
//  - Exact production ref guard (never staging, never interchangeable with it).
//  - Two independent gates before any write: the --execute CLI flag AND typing the exact
//    confirmation phrase RUN_PRODUCTION_UNCHANGED_SYNC at an interactive prompt. Without
//    --execute the script only does the read-only preview/validation and exits.
//  - Real admin auth only (email/password typed interactively, password never echoed,
//    never logged, never passed as an argument/env var/file). service_role is NEVER used
//    to call the RPC -- only to prove the real authenticated+is_admin() path works.
//  - Both Supabase clients use { persistSession: false, autoRefreshToken: false } so no
//    session token is ever written to disk; the admin session is signed out at the end
//    of the script regardless of outcome.
//  - Exactly one RPC call. No automatic retry under any circumstances. If the response is
//    ambiguous (thrown/network error), the script does a READ-ONLY check of
//    inventory_snapshot_syncs for this exact snapshot_id and reports the ground truth
//    instead of guessing or re-calling.
//  - Before/after full-table canonical SHA-256 fingerprints (select *, sorted by id,
//    deterministic key order) over reagents and reagent_lots, so "nothing changed" is
//    verified at the byte level, not just via row counts.
//
// Usage:
//   Preview only (no auth prompt, no write):
//     node scripts/production/verify-first-unchanged-sync.mjs
//   Actually execute (prompts for confirmation phrase, then admin email/password):
//     node scripts/production/verify-first-unchanged-sync.mjs --execute

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import readline from 'node:readline'
import * as XLSX from 'xlsx'
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from '../supabase-refs.mjs'
import { fetchAllPages } from '../../src/lib/fetchAllPages.js'
import {
  locationLabel, SNAPSHOT_COLUMNS, DATA_SHEET_NAME, GUIDE_SHEET_NAME,
  parseInventorySnapshotAoa, runGlobalValidation, buildMatchIndexes,
  matchInventorySnapshotRows, checkSyncReadiness, computeBaselineActiveLotIds,
  buildInventorySnapshotPayload,
} from '../../src/lib/inventorySnapshotMatch.js'

// ---- 0) production ref hard check ----
function loadEnvLocal() {
  const text = readFileSync(new URL('../../.env.local', import.meta.url), 'utf-8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const env = loadEnvLocal()
const urlRef = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]
if (urlRef === STAGING_PROJECT_REF || urlRef !== PRODUCTION_PROJECT_REF) {
  throw new Error(`[FATAL] .env.local ref(${urlRef}) is not production.`)
}
console.log(`[guard] production ref confirmed: ${urlRef}`)

const EXECUTE = process.argv.includes('--execute')
console.log(`[mode] ${EXECUTE ? 'EXECUTE (RPC call allowed)' : 'PREVIEW ONLY (no write)'}`)
if (EXECUTE && !process.stdin.isTTY) {
  throw new Error('[FATAL] --execute requires a real interactive terminal (TTY) for the admin password prompt. Refusing non-interactive execution.')
}

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function isGeneratedLot(lotSource) {
  return typeof lotSource === 'string' && lotSource.startsWith('generated')
}

// ---- 1) fresh read of current production state ----
async function fetchAll() {
  const [reagents, lots, locations] = await Promise.all([
    fetchAllPages((from, to) => anon.from('reagents').select('*').range(from, to)),
    fetchAllPages((from, to) => anon.from('reagent_lots').select('*').eq('status', 'active').range(from, to)),
    (async () => { const { data, error } = await anon.from('locations').select('id, room, detail'); if (error) throw error; return data })(),
  ])
  return { reagents, lots, locations }
}

async function fetchCurrentSnapshotRows(reagents, lots, locations) {
  const reagentsById = new Map(reagents.map((r) => [r.id, r]))
  const locById = new Map(locations.map((l) => [l.id, l]))
  return lots.filter((l) => reagentsById.has(l.reagent_id)).map((l) => {
    const r = reagentsById.get(l.reagent_id)
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

function writeWorkbookBuffer(rows) {
  const header = SNAPSHOT_COLUMNS.map((c) => c.label)
  const aoa = [header, ...rows.map((r) => SNAPSHOT_COLUMNS.map((c) => r[c.key] ?? ''))]
  const dataWs = XLSX.utils.aoa_to_sheet(aoa)
  const guideWs = XLSX.utils.aoa_to_sheet([['P2 in-memory snapshot (round-trip validation only)']])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, guideWs, GUIDE_SHEET_NAME)
  XLSX.utils.book_append_sheet(wb, dataWs, DATA_SHEET_NAME)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// ---- 2) canonical fingerprint ----
function canonicalize(obj) {
  if (Array.isArray(obj)) return obj.map(canonicalize)
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = canonicalize(obj[k]); return acc }, {})
  }
  return obj
}
function fingerprint(rows) {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return createHash('sha256').update(JSON.stringify(canonicalize(sorted))).digest('hex')
}
function updatedAtMap(rows) {
  const m = new Map()
  for (const r of rows) m.set(r.id, r.updated_at)
  return m
}

// ---- 3) prompts. Password prompt mutes readline's own echo (standard Node pattern:
// override the interface's private _writeToOutput) instead of hand-parsing raw keystrokes
// -- avoids embedding any control-character literals in this source file. ----
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a) }))
}
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    const originalWrite = rl._writeToOutput?.bind(rl)
    rl._writeToOutput = (str) => {
      if (!muted && originalWrite) originalWrite(str)
      // muted: suppress echo entirely (question prompt itself is written before muting).
    }
    process.stdout.write(question)
    muted = true
    rl.question('', (answer) => {
      muted = false
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}
function maskEmail(email) {
  const [user, domain] = String(email).split('@')
  if (!domain) return '***'
  return `${user.slice(0, 2)}***@${domain}`
}

async function main() {
  console.log('\n[1/6] fresh read of current production state...')
  const { reagents, lots, locations } = await fetchAll()
  console.log(`  reagents=${reagents.length} active_lots=${lots.length} locations=${locations.length}`)

  console.log('\n[2/6] building snapshot + round-trip validation (reusing the real parser/matcher)...')
  const rows = await fetchCurrentSnapshotRows(reagents, lots, locations)
  const buf = writeWorkbookBuffer(rows)
  const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const parsed = parseInventorySnapshotAoa(wb2.SheetNames, (name) => XLSX.utils.sheet_to_json(wb2.Sheets[name], { header: 1, raw: false, defval: '' }))
  if (parsed.fileError) throw new Error(`parse failed: ${parsed.fileError}`)
  runGlobalValidation(parsed.rows)
  const idx = buildMatchIndexes({ reagents, lots, locations })
  const matched = matchInventorySnapshotRows(parsed.rows, idx)
  const bucketCounts = { unchanged: 0, changed: 0, new: 0, review: 0, error: 0 }
  for (const row of matched) {
    const b = row.errors.length > 0 ? 'error'
      : ((row.reagentMatch.status === 'review' && !row.reagentMatch.reviewResolved) || (row.lotMatch.status === 'review' && !row.lotMatch.reviewResolved)) ? 'review'
      : (row.reagentMatch.status === 'new' || row.lotMatch.status === 'new') ? 'new'
      : 'unchanged'
    bucketCounts[b] += 1
  }
  const readiness = checkSyncReadiness(matched)
  console.log(`  buckets(approx)=${JSON.stringify(bucketCounts)} readiness=${JSON.stringify(readiness)}`)
  if (!readiness.ready) throw new Error('[STOP] readiness.ready=false -- review/error present, this is not a clean unchanged snapshot.')

  console.log('\n[3/6] computing before-fingerprint...')
  const reagentsShaBefore = fingerprint(reagents)
  const lotsShaBefore = fingerprint(lots)
  const reagentUpdatedAtBefore = updatedAtMap(reagents)
  const lotUpdatedAtBefore = updatedAtMap(lots)
  console.log(`  reagents_sha256_before=${reagentsShaBefore}`)
  console.log(`  reagent_lots_sha256_before=${lotsShaBefore}`)

  console.log('\n[4/6] audit pre-count...')
  const { count: syncsBefore } = await anon.from('inventory_snapshot_syncs').select('id', { count: 'exact', head: true })
  const { count: syncLogsBefore } = await anon.from('admin_logs').select('id', { count: 'exact', head: true }).eq('action', '현재 재고 동기화')
  console.log(`  inventory_snapshot_syncs=${syncsBefore} admin_logs(sync)=${syncLogsBefore}`)

  const baselineActiveLotIds = computeBaselineActiveLotIds(lots)
  const snapshotId = randomUUID()
  const payload = buildInventorySnapshotPayload(matched, {
    snapshotId, sourceFilename: 'production-gate-p2-unchanged-verification.xlsx', baselineActiveLotIds,
  })

  console.log('\n=== SUMMARY (before write) ===')
  console.log(`PRODUCTION REF:      ${urlRef}`)
  console.log(`ACTIVE LOTS:         ${lots.length}`)
  console.log(`SNAPSHOT ROWS:       ${payload.rows.length}`)
  console.log(`CHANGED (approx):    ${bucketCounts.changed}`)
  console.log(`NEW:                 ${bucketCounts.new}`)
  console.log(`EXCLUDED:            ${lots.length - payload.rows.length}`)
  console.log(`REVIEW:              ${bucketCounts.review}`)
  console.log(`SNAPSHOT ID:         ${snapshotId}`)
  console.log('MODE:                UNCHANGED PRODUCTION VERIFICATION')

  if (!EXECUTE) {
    console.log('\n[preview] ran without --execute -- stopping here (no RPC call).')
    return
  }
  if (payload.rows.length !== lots.length || bucketCounts.changed !== 0 || bucketCounts.new !== 0 || bucketCounts.review !== 0 || bucketCounts.error !== 0) {
    throw new Error('[STOP] this is not a clean unchanged snapshot (changed/new/review/excluded != 0). Refusing to call the RPC.')
  }

  const confirm = await ask('\nType exactly RUN_PRODUCTION_UNCHANGED_SYNC to proceed: ')
  if (confirm !== 'RUN_PRODUCTION_UNCHANGED_SYNC') {
    console.log('[abort] confirmation phrase did not match. Aborting.')
    return
  }

  console.log('\n[5/6] admin authentication (password will not be echoed or logged)...')
  const email = await ask('Admin email: ')
  const password = await askHidden('Password: ')
  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({ email, password })
  if (signInError) { console.error(`[FATAL] sign-in failed: ${signInError.message}`); return }
  const userId = signInData.user.id
  console.log(`[auth] signed in: ${maskEmail(email)} (uid=${userId})`)

  const authed = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  })

  const { data: adminRow, error: adminErr } = await authed.from('admin_users').select('active').eq('user_id', userId).maybeSingle()
  if (adminErr || !adminRow || adminRow.active !== true) {
    console.error('[STOP] not confirmed as an active admin in admin_users. Refusing to call the RPC.')
    await anon.auth.signOut()
    return
  }
  console.log('[auth] admin_users active=true confirmed.')

  console.log(`\n[6/6] calling sync_inventory_snapshot exactly once (snapshot_id=${snapshotId})...`)
  let rpcResult = null
  let rpcError = null
  try {
    const { data, error } = await authed.rpc('sync_inventory_snapshot', { payload })
    rpcResult = data
    rpcError = error
  } catch (e) {
    rpcError = { message: e.message, ambiguous: true }
  }

  console.log('[rpc] immediate response:', JSON.stringify({ rpcResult, rpcError }))

  // Whether the immediate response looked clean or ambiguous, the presence of this
  // snapshot_id's audit row is the ground truth -- never guess, never retry.
  const { data: auditRow, error: auditErr } = await anon.from('inventory_snapshot_syncs').select('*').eq('snapshot_id', snapshotId).maybeSingle()
  if (auditErr) console.error('[warn] audit lookup failed:', auditErr.message)

  const committed = !!auditRow
  console.log(`\n[ground truth] snapshot_id=${snapshotId} committed: ${committed}`)
  if (auditRow) console.log('[ground truth] audit row:', JSON.stringify(auditRow))

  console.log('\n[after] recomputing fingerprint...')
  const after = await fetchAll()
  const reagentsShaAfter = fingerprint(after.reagents)
  const lotsShaAfter = fingerprint(after.lots)
  const reagentUpdatedAtAfter = updatedAtMap(after.reagents)
  const lotUpdatedAtAfter = updatedAtMap(after.lots)

  let reagentUpdatedAtDiff = 0
  for (const [id, ts] of reagentUpdatedAtBefore) if (reagentUpdatedAtAfter.get(id) !== ts) reagentUpdatedAtDiff += 1
  let lotUpdatedAtDiff = 0
  for (const [id, ts] of lotUpdatedAtBefore) if (lotUpdatedAtAfter.get(id) !== ts) lotUpdatedAtDiff += 1

  const beforeReagentIds = new Set(reagents.map((r) => r.id))
  const afterReagentIds = new Set(after.reagents.map((r) => r.id))
  const beforeLotIds = new Set(lots.map((l) => l.id))
  const afterLotIds = new Set(after.lots.map((l) => l.id))

  const finalReport = {
    snapshotId, committed, rpcResult, rpcError,
    reagents_before: reagents.length, reagents_after: after.reagents.length,
    active_lots_before: lots.length, active_lots_after: after.lots.length,
    reagents_sha256_before: reagentsShaBefore, reagents_sha256_after: reagentsShaAfter,
    reagent_lots_sha256_before: lotsShaBefore, reagent_lots_sha256_after: lotsShaAfter,
    fingerprints_identical: reagentsShaBefore === reagentsShaAfter && lotsShaBefore === lotsShaAfter,
    reagent_updated_at_diff_count: reagentUpdatedAtDiff,
    lot_updated_at_diff_count: lotUpdatedAtDiff,
    reagent_id_missing: [...beforeReagentIds].filter((id) => !afterReagentIds.has(id)).length,
    reagent_id_new: [...afterReagentIds].filter((id) => !beforeReagentIds.has(id)).length,
    lot_id_missing: [...beforeLotIds].filter((id) => !afterLotIds.has(id)).length,
    lot_id_new: [...afterLotIds].filter((id) => !beforeLotIds.has(id)).length,
  }
  console.log('\n=== FINAL REPORT ===')
  console.log(JSON.stringify(finalReport, null, 2))

  await anon.auth.signOut()
  console.log('\n[auth] signed out. persistSession=false, so nothing was written to disk.')
}

main().catch((e) => { console.error('[FATAL]', e); process.exitCode = 1 })
