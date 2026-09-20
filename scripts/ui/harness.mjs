// Mock Supabase backend for Reagent List UI tests (no real network: every *.supabase.co request is fulfilled here).
import { chromium } from 'playwright-core'
export { chromium }

// Chrome 실행 파일: PW_CHROME 환경변수 > Playwright 기본 캐시 중 가장 최신 chromium. 앱 주소: UI_BASE(기본 http://localhost:5199)
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
function findChrome() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.LOCALAPPDATA || join(process.env.HOME || '', '.cache'), 'ms-playwright')
  if (!existsSync(base)) return undefined
  const dirs = readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()
  for (const d of dirs) for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
    const p = join(base, d, rel); if (existsSync(p)) return p
  }
  return undefined
}
export const CHROME = findChrome()
export const BASE = process.env.UI_BASE || 'http://localhost:5199'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const STEMS = ['acid', 'oxide', 'chloride', 'sulfate', 'nitrate', 'alcohol', 'amine', 'acetate', 'ether', 'benzene']
const KO = ['산', '산화물', '염화물', '황산염', '질산염', '알코올', '아민', '아세트산염', '에테르', '벤젠']
const HAZ = ['인화성 액체', '인화성 고체', '산화성 고체', '급성독성-경구', '피부 부식성/자극성', '발암성', '물반응성 물질 및 혼합물']

export const LOCATIONS = [
  { id: 'loc-a1', room: '5호관 101', detail: '시약장 A', name: 'x' },
  { id: 'loc-a2', room: '5호관 101', detail: '시약장 B', name: 'x' },
  { id: 'loc-b1', room: '5호관 102', detail: null, name: 'x' },
  { id: 'loc-c1', room: '냉장실', detail: null, name: 'x' },
]

export function buildReagents(n = 1300) {
  const out = []
  for (let i = 0; i < n; i++) {
    const L = LETTERS[i % 26]
    const stem = i % 10
    const lotCount = 1 + (i % 3 === 0 ? 1 : 0)
    const lots = []
    for (let k = 0; k < lotCount; k++) {
      lots.push({
        id: `lot-${i}-${k}`, status: 'active', sealed_count: (i + k) % 4, current_stock: (i * 7 + k * 13) % 101,
        location_id: LOCATIONS[(i + k) % 4].id, lot_no: `LOT${i}${k}`, expiry_date: null, cat_no: null, pending_confirm: false,
      })
    }
    const hazard = i % 3 === 0 ? [{ name: HAZ[i % HAZ.length] }] : null
    out.push({
      id: `r-${String(i).padStart(4, '0')}`,
      name: `${L}${String(i).padStart(4, '0')} ${STEMS[stem]}`,
      name_ko: `${KO[stem]} ${i}`,
      cas_no: `${1000 + i}-${String(i % 90).padStart(2, '0')}-${i % 10}`,
      company: i % 2 ? 'Sigma-Aldrich' : 'Daejung', purity: '99%', volume: 500, unit: 'mL', category: 'liquid',
      ghs_pictograms: null, hazard_classifications: hazard, reagent_type: 'purchased', pending_confirm: false,
      msds_url: null, last_confirmed_at: null, cas_verification_status: i % 50 === 0 ? 'mismatch' : null,
      cas_verification_note: null, sort_letter: L, status: 'active', reagent_lots: lots,
    })
  }
  // a known special-management substance
  out[5] = { ...out[5], name: 'Benzene', name_ko: '벤젠', cas_no: '71-43-2', sort_letter: 'B' }
  return out
}

export async function installMock(context, reagents, stats = { requests: [], reagentQueries: 0 }) {
  await context.route(/^https:\/\/[^/]*supabase\.co\//, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    stats.requests.push(`${req.method()} ${path}${url.search.slice(0, 80)}`)
    const json = (body, status = 200, headers = {}) => route.fulfill({
      status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body),
    })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    const p = url.searchParams
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (path.endsWith('/rest/v1/inventory_sessions')) return json(stats.session ? [stats.session] : [])
    if (path.endsWith('/rest/v1/inventory_counts')) return json(stats.session ? (stats.counts || []) : [], 200, { 'content-range': `0-${Math.max((stats.counts || []).length - 1, 0)}/${(stats.counts || []).length}` })
    if (path.endsWith('/rest/v1/locations')) return json(LOCATIONS)
    if (path.endsWith('/rest/v1/reagent_lots')) {
      const inList = (p.get('location_id') || '').match(/^in\.\((.*)\)$/)
      if (/^reagent_id(, ?location_id)?$/.test(p.get('select') || '') && inList) {
        const ids = new Set(inList[1].split(','))
        const rows = reagents.flatMap(r => r.reagent_lots.filter(l => ids.has(l.location_id) && l.status === 'active').map(l => ({ reagent_id: r.id, location_id: l.location_id })))
        return json(rows)
      }
      const inId = (p.get('id') || '').match(/^in\.\((.*)\)$/)
      if (inId) {
        const ids = new Set(inId[1].split(','))
        return json(reagents.flatMap(r => r.reagent_lots.filter(l => ids.has(l.id)).map(l => ({ ...l, reagent_id: r.id, reagents: { id: r.id, name: r.name, name_ko: r.name_ko, cas_no: r.cas_no, company: r.company, category: r.category, hazard: null, volume: r.volume, unit: r.unit, purity: r.purity }, locations: { room: '5호관 101', detail: null } }))))
      }
      const inR = (p.get('reagent_id') || '').match(/^in\.\((.*)\)$/)
      if (inR) {
        const ids = new Set(inR[1].split(','))
        return json(reagents.filter(r => ids.has(r.id)).flatMap(r => r.reagent_lots.map(l => ({ ...l, reagent_id: r.id, received_date: '2026-01-01', reagents: { id: r.id, name: r.name, cas_no: r.cas_no } }))))
      }
      const rid = (p.get('reagent_id') || '').replace('eq.', '')
      return json(reagents.find(r => r.id === rid)?.reagent_lots || [])
    }
    if (path.endsWith('/rest/v1/reagents')) {
      const sel = p.get('select') || ''
      const idEq = (p.get('id') || '').match(/^eq\.(.*)$/)
      if (idEq) {
        const r = reagents.find(x => x.id === idEq[1])
        if (wantsObject) return r ? json(r) : json({ message: 'none' }, 406)
        return json(r ? [r] : [])
      }
      if (sel === 'name') { stats.reagentQueries++; return json(reagents.map(r => ({ name: r.name }))) }
      stats.reagentQueries++
      let rows = reagents
      const or = p.get('or')
      if (or) {
        const term = (or.match(/name\.ilike\."?%(.*?)%"?,name_ko/) || [])[1]?.toLowerCase()
        if (term) rows = rows.filter(r => r.name.toLowerCase().includes(term) || (r.name_ko || '').toLowerCase().includes(term) || (r.cas_no || '').toLowerCase().includes(term))
      }
      const inIds = (p.get('id') || '').match(/^in\.\((.*)\)$/)
      if (inIds) { const s = new Set(inIds[1].split(',')); rows = rows.filter(r => s.has(r.id)) }
      const total = rows.length
      // supabase-js .range(a, b) 는 offset/limit 쿼리로 전달된다 — 실제 PostgREST 처럼 잘라서 응답(1000행 페이징 검증)
      if (p.get('limit') !== null) { const off = Number(p.get('offset') || 0); rows = rows.slice(off, off + Number(p.get('limit'))) }
      return json(rows, 200, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${total}` })
    }
    if (req.method() === 'GET') return json(wantsObject ? {} : [])
    return json(null, 200)
  })
  return stats
}

export function results() {
  const rs = []
  const test = async (name, fn) => {
    try { const d = await fn(); rs.push({ name, ok: true, d }); console.log(`[PASS] ${name}${d ? ' — ' + JSON.stringify(d) : ''}`) }
    catch (e) { rs.push({ name, ok: false, d: e.message }); console.log(`[FAIL] ${name}: ${e.message}`) }
  }
  const summary = () => { const f = rs.filter(r => !r.ok); console.log(`\nTOTAL=${rs.length} PASS=${rs.length - f.length} FAIL=${f.length}`); return f.length }
  return { test, summary }
}
export const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected=${JSON.stringify(b)} actual=${JSON.stringify(a)}`) }
export const ok = (c, m) => { if (!c) throw new Error(m) }
