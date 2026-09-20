// 시약 검색 순수 규칙 + 일괄검색 매칭 단위 테스트(node, DB 없음).
import { normalizeTerm, rankFields, suggestFrom, searchTermVariants, parseBatchLines, runBatchMatch, BATCH_MAX_LINES, reagentOrFilter, casFromDigits } from '../src/lib/reagentMatch.js'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const R = (id, name, name_ko, cas_no) => ({ id, name, name_ko, cas_no })
const base = [
  R('acetic', 'Acetic acid', '아세트산', '64-19-7'),
  R('acetone', 'Acetone', '아세톤', '67-64-1'),
  R('btb', 'Bromothymol blue', '브로모티몰블루', '76-59-5'),
  R('tb', 'Thymol blue', '티몰블루', '76-61-9'),
  R('tp', 'Thymolphthalein', '티몰프탈레인', '125-20-2'),
  R('iron', 'Iron(III) chloride', '염화철(III)', '7705-08-0'),
  R('limo', '(R)-(+)-Limonene', '(R)-(+)-리모넨', '5989-27-5'),
  R('glac', 'Acetic acid, glacial', '빙초산', '64-19-7'),
  R('hcl', 'Hydrochloric acid', '염산', '7647-01-0'),
  R('nocas', 'Sodium chloride', '염화나트륨', null),
]
const ids = (r) => r.matchedIds.slice().sort()

// ── 입력 전처리 ──────────────────────────────────────────────
{
  const p = parseBatchLines('  Acetic acid \r\n\r\n아세트산\r\n  acetic   ACID  \n64-19-7\n\n\r브로모티몰블루(BTB)\n')
  ok('parse: CRLF/LF/CR, trim, blank lines removed, whitespace/case-only duplicates collapsed (first spelling kept)', same(p.terms, ['Acetic acid', '아세트산', '64-19-7', '브로모티몰블루(BTB)']) && p.duplicates === 1, p)
  ok('parse: empty / whitespace-only text → zero terms', parseBatchLines('  \n\r\n \t ').terms.length === 0 && parseBatchLines(undefined).terms.length === 0)
  ok('parse: full-width characters are normalized (NFKC) — "ＡＣＥＴＯＮＥ" == "acetone" duplicate', same(parseBatchLines('ＡＣＥＴＯＮＥ\nacetone').terms, ['ACETONE']))
}

// ── 사양 fixture ──────────────────────────────────────────────
const fixture = ['Acetic acid', 'acet', '아세트산', '64-19-7', '64197', '브로모티몰블루(BTB)', '티몰블루', '티몰프탈레인', '존재하지않는시약XYZ'].join('\n')
{
  const r = runBatchMatch(base, fixture)
  const per = Object.fromEntries(r.perTerm.map(t => [t.term, t.ids.slice().sort()]))
  ok('english exact ("Acetic acid") → both acetic acid masters (broad, not one pick)', same(per['Acetic acid'], ['acetic', 'glac']), per['Acetic acid'])
  ok('partial english ("acet") → Acetic acid(+glacial) + Acetone', same(per['acet'], ['acetic', 'acetone', 'glac']), per['acet'])
  ok('korean ("아세트산") → Acetic acid masters', same(per['아세트산'], ['acetic']))
  ok('CAS with hyphens (64-19-7) and without (64197) find the same masters', same(per['64-19-7'], ['acetic', 'glac']) && same(per['64197'], ['acetic', 'glac']), { a: per['64-19-7'], b: per['64197'] })
  ok('"브로모티몰블루(BTB)": original finds nothing → falls back to "브로모티몰블루" → Bromothymol blue (via recorded)', same(per['브로모티몰블루(BTB)'], ['btb']) && r.perTerm.find(t => t.term === '브로모티몰블루(BTB)').via === '브로모티몰블루')
  ok('"티몰블루" is broad: Thymol blue + Bromothymol blue (contains match, no candidate picking)', same(per['티몰블루'], ['btb', 'tb']), per['티몰블루'])
  ok('"티몰프탈레인" → Thymolphthalein', same(per['티몰프탈레인'], ['tp']))
  ok('unknown input is unmatched and adds no reagent', same(r.unmatched, ['존재하지않는시약XYZ']) && !r.matchedIds.includes(undefined))
  ok('OR + dedupe: matchedIds are unique reagent ids across all lines', new Set(r.matchedIds).size === r.matchedIds.length && same(ids(r), ['acetic', 'acetone', 'btb', 'glac', 'tb', 'tp']), ids(r))
}

// ── OR/dedupe/전처리 조합 ─────────────────────────────────────
{
  const r = runBatchMatch(base, ' Acetone \r\n\r\nacetone\r\n아세톤\r\n67-64-1\n')
  ok('same reagent via 4 spellings/duplicate lines → listed once; duplicate line removed before matching', same(r.matchedIds, ['acetone']) && r.duplicates === 1 && r.terms.length === 3, r)
  ok('empty text → no terms, no matches', runBatchMatch(base, '').terms.length === 0 && runBatchMatch(base, '').matchedIds.length === 0)
}

// ── 괄호 안전 규칙 ────────────────────────────────────────────
{
  ok('variants: chemical-name parentheses untouched when no trailing annotation', same(searchTermVariants('Iron(III) chloride'), ['Iron(III) chloride']) && same(searchTermVariants('(R)-(+)-Limonene'), ['(R)-(+)-Limonene']))
  ok('variants: trailing "(...)" → [original, head, inner(≥3 chars with letters)]', same(searchTermVariants('브로모티몰블루(BTB)'), ['브로모티몰블루(BTB)', '브로모티몰블루', 'BTB']) && same(searchTermVariants('Acetic acid (glacial)'), ['Acetic acid (glacial)', 'Acetic acid', 'glacial']))
  ok('variants: numeric/percent/short annotations are not used as search terms', same(searchTermVariants('Ethanol (99%)'), ['Ethanol (99%)', 'Ethanol']) && same(searchTermVariants('HCl (aq)'), ['HCl (aq)', 'HCl']) && same(searchTermVariants('Sodium (12)'), ['Sodium (12)', 'Sodium']))
  ok('variants: leading parenthesis or 1-char head → no stripping', same(searchTermVariants('(R)-limonene'), ['(R)-limonene']) && same(searchTermVariants('A (B)'), ['A (B)']))
  const r = runBatchMatch(base, 'Iron(III) chloride\n(R)-(+)-Limonene\nAcetic acid (glacial)\nHydrochloric acid (35%)\nSodium chloride (aq)')
  const per = Object.fromEntries(r.perTerm.map(t => [t.term, [t.ids.slice().sort(), t.via]]))
  ok('parenthesized real names still match by ORIGINAL text (no fallback used)', same(per['Iron(III) chloride'], [['iron'], null]) && same(per['(R)-(+)-Limonene'], [['limo'], null]), per)
  ok('fallback only when original found nothing: "Acetic acid (glacial)" → head "Acetic acid"; "(35%)"/"(aq)" annotations dropped', same(per['Acetic acid (glacial)'], [['acetic', 'glac'], 'Acetic acid']) && same(per['Hydrochloric acid (35%)'], [['hcl'], 'Hydrochloric acid']) && same(per['Sodium chloride (aq)'], [['nocas'], 'Sodium chloride']), per)
  // 원문이 이미 결과를 가지면 대체 검색어로 결과를 넓히지 않는다
  const x = runBatchMatch([R('a', 'Foo (BTB)', null, null), R('b', 'Foo', null, null)], 'Foo (BTB)')
  ok('original hit is never widened by the fallback ("Foo (BTB)" matches only the master literally named so)', same(x.matchedIds, ['a']), x)
  ok('autocomplete uses the same fallback: typing 브로모티몰블루(BTB) suggests Bromothymol blue; still nothing for junk', same(suggestFrom(base, '브로모티몰블루(BTB)', r => r).map(x => x.id), ['btb']) && suggestFrom(base, '존재하지않는시약(XYZ)', r => r).length === 0)
  ok('autocomplete ranking for normal input unchanged (Acetic acid before Acetone for "acet")', same(suggestFrom(base, 'acet', r => r).map(x => x.id), ['acetic', 'glac', 'acetone']))
}

// ── 판정 동치: 일괄검색 boolean 판정 == rankFields !== null ──────────
{
  const rnd = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789-() 아세트산티몰블루'[Math.floor(Math.random() * 51)]).join('')
  const items = Array.from({ length: 400 }, (_, i) => R('r' + i, rnd(8 + (i % 12)), i % 3 ? rnd(4 + (i % 6)) : null, i % 4 ? `${1000 + i}-${String(i % 90).padStart(2, '0')}-${i % 10}` : null))
  let mismatches = 0, checks = 0
  for (let t = 0; t < 600; t++) {
    const src = items[(t * 7) % items.length]
    const pool = [src.name, src.name_ko, src.cas_no, String(src.cas_no || '').replace(/-/g, '')].filter(Boolean)
    const s = pool[t % pool.length] || 'a'
    const a = Math.floor(Math.random() * s.length), b = a + 1 + Math.floor(Math.random() * 6)
    const term = normalizeTerm(s.slice(a, b)) || 'a'
    const viaRank = items.filter(it => rankFields(it, term) !== null).map(it => it.id)
    const viaBatch = runBatchMatch(items, term).perTerm[0]
    const ownIds = (viaBatch?.via ? [] : viaBatch?.ids) || []
    if (!viaBatch?.via) { checks++; if (!same(ownIds, viaRank)) mismatches++ }
  }
  ok('equivalence: fast batch predicate == (rankFields !== null) on 600 random terms × 400 items (no fallback cases)', mismatches === 0 && checks > 300, { checks, mismatches })
}

// ── 서버 목록 검색 필터(실제 staging 브라우저 QA 에서 발견한 두 결함의 회귀) ──
{
  ok('server filter: hyphenless CAS 64197 also searches 64-19-7', casFromDigits('64197') === '64-19-7' && casFromDigits('7647145') === '7647-14-5' && casFromDigits('6419') === null && casFromDigits('64-19-7') === null && reagentOrFilter('64197').includes('cas_no.ilike."%64-19-7%"'))
  const f = reagentOrFilter('Iron(III) chloride')
  ok('server filter: parentheses/commas are kept (double-quoted values) instead of being replaced by spaces', f === 'name.ilike."%Iron(III) chloride%",name_ko.ilike."%Iron(III) chloride%",cas_no.ilike."%Iron(III) chloride%"' && reagentOrFilter('a,b').includes('"%a,b%"'), f)
  ok('server filter: quotes/backslash/wildcards cannot break out of the value', !/"%[^"]*"[^,]*"/.test(reagentOrFilter('x"),name.eq."y')) && reagentOrFilter('50%*').split('%').length <= 7 && reagentOrFilter('   ') === '')
}

// ── 성능 ─────────────────────────────────────────────────────
{
  const big = Array.from({ length: 2000 }, (_, i) => R('p' + i, `Reagent ${i} ${['acid', 'oxide', 'chloride', 'sulfate'][i % 4]}`, `시약 ${i} ${['산', '산화물', '염화물', '황산염'][i % 4]}`, `${1000 + i}-${String(i % 90).padStart(2, '0')}-${i % 10}`))
  const mk = (n) => Array.from({ length: n }, (_, i) => (i % 5 === 0 ? `시약 ${i * 7} 산` : i % 5 === 1 ? `Reagent ${i * 11} oxide` : i % 5 === 2 ? `${1000 + i * 3}-${String((i * 3) % 90).padStart(2, '0')}-${(i * 3) % 10}` : i % 5 === 3 ? `없는시약${i}(ABC)` : `chloride ${i}`)).join('\n')
  for (const n of [35, 100, 500, 1000]) {
    const t0 = performance.now(); const r = runBatchMatch(big, mk(n)); const ms = performance.now() - t0
    ok(`perf: ${n} lines × 2,000 reagents in ${ms.toFixed(0)}ms (${r.matchedIds.length} matched, ${r.unmatched.length} unmatched)`, ms < 1500, { ms: Math.round(ms) })
  }
  const over = runBatchMatch(big, Array.from({ length: BATCH_MAX_LINES + 50 }, (_, i) => `line ${i}`).join('\n'))
  ok(`guard: more than ${BATCH_MAX_LINES} lines are truncated and reported (${50} dropped)`, over.terms.length === BATCH_MAX_LINES && over.truncated === 50, { terms: over.terms.length, truncated: over.truncated })
}

const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
