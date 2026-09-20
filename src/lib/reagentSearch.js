import { supabase } from '../supabase'
import { fetchAllPages } from './fetchAllPages'
import { normalizeTerm, SUGGEST_LIMIT } from './reagentMatch.js'

// 순수 검색 규칙(rankFields/suggestFrom/highlightParts/일괄검색 …)은 reagentMatch.js — 여기서 그대로 다시 내보낸다.
export * from './reagentMatch.js'

// 시약 검색 semantics 의 정본 — 자동추천(ReagentSearchInput)과 목록 검색(or 필터)이 같은 규칙을 쓴다.
//  영문 시약명 / 국문 시약명 / CAS No. 를 대소문자 무시로 검색한다.
export const SUGGEST_DEBOUNCE_MS = 150

// 시약 목록 정렬 정본(시약목록/일괄정리 공통): 영문명 기준 자연 정렬.
export const compareReagentNames = (a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''))

// ── 공용 시약 인덱스(가볍게 한 번만 로드해 모든 자동추천이 공유) ─────────────────────────────
// 매 키 입력마다 서버에 묻지 않는다: id/영문명/국문명/CAS/제조사/분류만 1회 조회(약 1.3천 행)해 메모리에서 검색.
const INDEX_TTL_MS = 5 * 60 * 1000
let indexCache = null   // { at, promise, data }
export function invalidateReagentIndex() { indexCache = null }
export function loadReagentIndex() {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.promise
  const entry = { at: Date.now(), promise: null }
  entry.promise = fetchAllPages((from, to) => supabase.from('reagents')
    .select('id, name, name_ko, cas_no, company, category, purity, volume, unit').neq('status', 'archived').order('name').range(from, to))
    .catch((e) => { if (indexCache === entry) indexCache = null; throw e })
  indexCache = entry
  return entry.promise
}

// 위치(방/구역)명으로 시약 찾기(홈 검색창 전용) — 위치는 보조 정보이므로 시약 후보가 부족할 때만 추가로 붙인다.
let locationsCache = null
export async function suggestByLocation(term, limit = SUGGEST_LIMIT) {
  const t = normalizeTerm(term).replace(/[,()%*\\]/g, ' ').trim().toLowerCase()
  if (t.length < 2) return []
  if (!locationsCache) locationsCache = supabase.from('locations').select('id, room, detail').then(r => r.data || [])
  const locs = (await locationsCache).filter(l => `${l.room} ${l.detail || ''}`.toLowerCase().includes(t))
  if (locs.length === 0) return []
  const { data: lots } = await supabase.from('reagent_lots').select('reagent_id, location_id').in('location_id', locs.map(l => l.id)).eq('status', 'active')
  const byReagent = new Map()
  for (const l of lots || []) {
    if (byReagent.has(l.reagent_id)) continue
    const loc = locs.find(x => x.id === l.location_id)
    byReagent.set(l.reagent_id, `${loc.room}${loc.detail ? ' ' + loc.detail : ''}`)
  }
  const index = await loadReagentIndex()
  return index.filter(r => byReagent.has(r.id)).slice(0, limit).map(r => ({ ...r, matchedLocation: byReagent.get(r.id) }))
}
