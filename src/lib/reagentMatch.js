// 시약 검색 규칙의 "순수 함수" 정본 — DB/브라우저에 의존하지 않아 node 로 그대로 테스트한다.
// lib/reagentSearch.js 가 이 모듈을 그대로 다시 내보내므로 앱 코드는 reagentSearch 에서 가져다 쓴다.
//  자동추천 · 목록 검색 · 시약 일괄검색이 모두 같은 규칙을 쓴다: 영문명 / 국문명 / CAS No. (대소문자 무시, 포함 검색, 하이픈 없는 CAS 허용).

// 입력 정리: 앞뒤 공백 제거 + 연속 공백 1칸 + 전각→반각 정도의 NFKC(한글은 그대로).
export const normalizeTerm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const lc = (s) => String(s ?? '').normalize('NFKC').toLowerCase()
const digitsOnly = (s) => String(s ?? '').replace(/[^0-9]/g, '')
export const SUGGEST_LIMIT = 10

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

// ── 괄호 보조표기 ───────────────────────────────────────────────────────────────
// "브로모티몰블루(BTB)" / "Acetic acid (glacial)" 처럼 이름 뒤에 붙은 괄호 표기 때문에 원문으로는 못 찾는 경우를 위한 대체 검색어.
// 안전 조건 — 화학명 자체에 들어가는 괄호("Iron(III) chloride", "(R)-(+)-Limonene", "2-(N-Morpholino)…")를 망치지 않도록:
//  1) 항상 "원문"을 먼저 검색한다. 대체 검색어는 원문이 아무것도 못 찾았을 때만 쓴다(찾은 결과를 넓히거나 바꾸지 않는다).
//  2) 문자열 "끝"의 닫힌 괄호 1개만 대상. 괄호 앞 본문이 2자 이상이어야 한다("(R)-…"처럼 괄호로 시작하면 대상 아님).
//  3) 1순위 대체 = 괄호 앞 본문, 2순위 대체 = 괄호 안 내용(3자 이상이며 글자를 포함, 숫자·% 만이면 제외).
export function searchTermVariants(rawTerm) {
  const t = normalizeTerm(rawTerm)
  const out = t ? [t] : []
  const m = t.match(/^(.*\S)\s*\(([^()]*)\)$/)
  if (m && m[1].replace(/\s/g, '').length >= 2) {
    const head = normalizeTerm(m[1]), inner = normalizeTerm(m[2])
    if (head && !out.includes(head)) out.push(head)
    if (inner.length >= 3 && /[A-Za-z가-힣]/.test(inner) && !out.includes(inner)) out.push(inner)
  }
  return out
}

// items 에서 term 에 맞는 것만 순위·이름순으로 최대 limit 개. getFields(item) → { name, name_ko, cas_no, extra? }
// 원문 검색 결과가 없을 때만 괄호 대체 검색어로 다시 찾는다(searchTermVariants).
export function suggestFrom(items, term, getFields, limit = SUGGEST_LIMIT) {
  if (!normalizeTerm(term)) return []
  for (const variant of searchTermVariants(term)) {
    const hits = []
    for (const it of items) {
      const rank = rankFields(getFields(it), variant)
      if (rank !== null) hits.push({ it, rank, name: getFields(it).name || '' })
    }
    if (hits.length === 0) continue
    hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
    return hits.slice(0, limit).map(h => h.it)
  }
  return []
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

// ── 일괄검색(여러 줄) ─────────────────────────────────────────────────────────────
// 검색 규칙은 위와 동일(영문명/국문명/CAS 포함 검색 + 하이픈 없는 CAS). rankFields !== null 과 같은 판정을
// 시약마다 소문자/숫자 변환을 미리 해 두고 boolean 으로 빠르게 계산한다(포함 검색은 시작/단어시작 순위를 모두 포함하므로 동치).
export const BATCH_MAX_LINES = 1000

function prepare(item, getFields) {
  const f = getFields(item)
  const c = lc(f.cas_no)
  return { item, n: lc(f.name), k: lc(f.name_ko), c, cd: digitsOnly(c) }
}
function matchesPrepared(p, term, termDigits, termIsCas) {
  return p.n.includes(term) || p.k.includes(term) || (!!p.c && p.c.includes(term)) || (termIsCas && p.cd.startsWith(termDigits))
}

// text(여러 줄) → 입력 줄 목록. CRLF/LF/CR 모두 지원, 앞뒤 공백 제거, 빈 줄 제거, 정규화 결과가 같은 중복 줄은 하나로(원문은 첫 줄 것 유지).
export function parseBatchLines(text) {
  const all = String(text ?? '').split(/\r\n|\n|\r/)
  const seen = new Set(), terms = []
  let blank = 0, duplicates = 0
  for (const line of all) {
    const norm = normalizeTerm(line)
    if (!norm) { blank++; continue }
    const key = norm.toLowerCase()
    if (seen.has(key)) { duplicates++; continue }
    seen.add(key); terms.push(norm)
  }
  const truncated = Math.max(0, terms.length - BATCH_MAX_LINES)
  return { terms: terms.slice(0, BATCH_MAX_LINES), blank, duplicates, truncated }
}

// 각 입력 줄을 공통 규칙으로 찾아 OR 로 합친다(같은 시약이 여러 줄에 걸려도 한 번만).
//  · 한 줄이 여러 시약에 걸리면 모두 포함(후보 하나를 고르게 하지 않는다).
//  · 원문이 아무것도 못 찾으면 괄호 대체 검색어를 차례로 시도(searchTermVariants).
// 결과: { terms, matchedIds[], unmatched[], perTerm[{term, ids, via}], blank, duplicates, truncated }
export function runBatchMatch(items, text, getFields = (r) => r) {
  const parsed = parseBatchLines(text)
  const prepared = items.map(it => prepare(it, getFields))
  const matched = new Set()
  const unmatched = [], perTerm = []
  for (const term of parsed.terms) {
    let ids = [], via = null
    for (const variant of searchTermVariants(term)) {
      const v = lc(variant)
      const vd = digitsOnly(v)
      const isCas = vd.length >= 3 && /^[0-9-]+$/.test(v)
      ids = []
      for (const p of prepared) if (matchesPrepared(p, v, vd, isCas)) ids.push(p.item.id)
      if (ids.length) { via = variant === term ? null : variant; break }
    }
    perTerm.push({ term, ids, via })
    if (ids.length === 0) unmatched.push(term)
    else ids.forEach(id => matched.add(id))
  }
  return { ...parsed, matchedIds: [...matched], unmatched, perTerm }
}
