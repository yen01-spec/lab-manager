import { supabase } from '../supabase'
import { fetchAllPages } from './fetchAllPages'

// 시약 검색 semantics 의 정본 — 자동추천(ReagentSearchInput)과 목록 검색(or 필터)이 같은 규칙을 쓴다.
//  영문 시약명 / 국문 시약명 / CAS No. 를 대소문자 무시로 검색한다.
export const SUGGEST_LIMIT = 10
export const SUGGEST_DEBOUNCE_MS = 150

// 입력 정리: 앞뒤 공백 제거 + 연속 공백 1칸 + 전각→반각 정도의 NFKC(한글은 그대로).
export const normalizeTerm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const lc = (s) => String(s ?? '').normalize('NFKC').toLowerCase()
const digitsOnly = (s) => String(s ?? '').replace(/[^0-9]/g, '')

// PostgREST or() 필터 — 쉼표/괄호/와일드카드는 필터 문법을 깨므로 공백으로 치환한다.
export function reagentOrFilter(term) {
  const t = normalizeTerm(term).replace(/[,()%*\\]/g, ' ').trim()
  return t ? `name.ilike.%${t}%,name_ko.ilike.%${t}%,cas_no.ilike.%${t}%` : ''
}

// 시약 목록 정렬 정본(시약목록/일괄정리 공통): 영문명 기준 자연 정렬.
export const compareReagentNames = (a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''))

// 일치 순위(낮을수록 위). null = 불일치.
//  0 영문명 시작 · 1 CAS 시작 · 2 국문명 시작 · 3 영문명 단어 시작 · 4 영문명 포함 · 5 국문명 포함 · 6 CAS 포함 · 7 추가 필드(Lot No. 등) 포함
export function rankFields({ name, name_ko, cas_no, extra }, rawTerm) {
  const term = lc(normalizeTerm(rawTerm))
  if (!term) return null
  const n = lc(name), k = lc(name_ko), c = lc(cas_no)
  if (n.startsWith(term)) return 0
  if (c && (c.startsWith(term) || (digitsOnly(term).length >= 3 && digitsOnly(c).startsWith(digitsOnly(term)) && /^[0-9-]+$/.test(term)))) return 1
  if (k.startsWith(term)) return 2
  if (n.split(/[\s\-(),/]+/).some(w => w && w.startsWith(term))) return 3
  if (n.includes(term)) return 4
  if (k.includes(term)) return 5
  if (c.includes(term)) return 6
  if ((extra || []).some(x => lc(x).includes(term))) return 7
  return null
}

// items 에서 term 에 맞는 것만 순위·이름순으로 최대 limit 개. getFields(item) → { name, name_ko, cas_no, extra? }
export function suggestFrom(items, term, getFields, limit = SUGGEST_LIMIT) {
  if (!normalizeTerm(term)) return []
  const hits = []
  for (const it of items) {
    const rank = rankFields(getFields(it), term)
    if (rank !== null) hits.push({ it, rank, name: getFields(it).name || '' })
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
  return hits.slice(0, limit).map(h => h.it)
}

// 일치 구간 강조용 분할(대소문자 무시, 첫 일치 1곳만) — 접근성을 위해 <mark> 로 렌더한다.
export function highlightParts(text, rawTerm) {
  const t = String(text ?? '')
  const term = normalizeTerm(rawTerm)
  if (!t || !term) return [{ text: t, hit: false }]
  const i = t.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return [{ text: t, hit: false }]
  return [{ text: t.slice(0, i), hit: false }, { text: t.slice(i, i + term.length), hit: true }, { text: t.slice(i + term.length), hit: false }].filter(p => p.text)
}

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
