// production / staging 스키마 지문 비교 (읽기 전용 파일 2개 입력).  node scripts/schema-diff.mjs prod.json staging.json [--scope-only] [--json]
import { readFileSync } from 'node:fs'
const load = (p) => { const t = readFileSync(p, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'))).rows[0].jsonb_build_object }
const [, , prodPath, stgPath, ...flags] = process.argv
const prod = load(prodPath), stg = load(stgPath)
import { SCOPE } from './schema-diff-scope.mjs'
const norm = (x) => (typeof x === 'string' ? x : x?.norm)
const out = { onlyProd: [], onlyStg: [], tables: {} }
const names = new Set([...Object.keys(prod.tables), ...Object.keys(stg.tables)])
for (const t of [...names].sort()) {
  if (!stg.tables[t]) { out.onlyProd.push(t); continue }
  if (!prod.tables[t]) { out.onlyStg.push(t); continue }
  const P = prod.tables[t], S = stg.tables[t], d = { columns: [], constraints: [], indexes: [], triggers: [], rls: null }
  const pc = new Map(P.columns.map(c => [c.name, c])), sc = new Map(S.columns.map(c => [c.name, c]))
  for (const [n, c] of pc) {
    const s = sc.get(n)
    if (!s) d.columns.push({ kind: 'missing_in_staging', name: n, prod: `${c.type}${c.notnull ? ' NOT NULL' : ''}${c.default ? ' default ' + c.default : ''}` })
    else {
      const diffs = []
      if (c.type !== s.type) diffs.push(`type ${c.type} ≠ ${s.type}`)
      if (c.notnull !== s.notnull) diffs.push(`notnull ${c.notnull} ≠ ${s.notnull}`)
      if ((c.default || null) !== (s.default || null)) diffs.push(`default ${c.default} ≠ ${s.default}`)
      if (diffs.length) d.columns.push({ kind: 'differs', name: n, diffs })
    }
  }
  for (const [n, s] of sc) if (!pc.has(n)) d.columns.push({ kind: 'extra_in_staging', name: n, stg: s.type })
  const key = k => `${k.type}|${k.def}`
  const pk = new Set(P.constraints.map(key)), sk = new Set(S.constraints.map(key))
  for (const k of P.constraints) if (!sk.has(key(k))) d.constraints.push({ kind: 'missing_in_staging', type: k.type, def: k.def, name: k.name })
  for (const k of S.constraints) if (!pk.has(key(k))) d.constraints.push({ kind: 'extra_in_staging', type: k.type, def: k.def, name: k.name })
  const pi = new Set(P.indexes.map(norm)), si = new Set(S.indexes.map(norm))
  for (const i of pi) if (!si.has(i)) d.indexes.push({ kind: 'missing_in_staging', def: i })
  for (const i of si) if (!pi.has(i)) d.indexes.push({ kind: 'extra_in_staging', def: i })
  const pt = new Set(P.triggers.map(norm)), st = new Set(S.triggers.map(norm))
  for (const i of pt) if (!st.has(i)) d.triggers.push({ kind: 'missing_in_staging', def: i })
  for (const i of st) if (!pt.has(i)) d.triggers.push({ kind: 'extra_in_staging', def: i })
  if (P.rls !== S.rls) d.rls = { prod: P.rls, stg: S.rls }
  if (d.columns.length || d.constraints.length || d.indexes.length || d.triggers.length || d.rls) out.tables[t] = d
}
out.sequences = { onlyProd: prod.sequences.filter(x => !stg.sequences.includes(x)), onlyStg: stg.sequences.filter(x => !prod.sequences.includes(x)) }
if (flags.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0) }
const scopeOnly = flags.includes('--scope-only')
console.log(`only in production: ${out.onlyProd.join(', ') || '-'}\nonly in staging   : ${out.onlyStg.join(', ') || '-'}`)
for (const [t, d] of Object.entries(out.tables)) {
  if (scopeOnly && !SCOPE.includes(t)) continue
  console.log(`\n■ ${t}${SCOPE.includes(t) ? '  [복원 범위]' : ''}`)
  for (const c of d.columns) console.log(`  col  ${c.kind}: ${c.name} ${c.prod || c.stg || ''} ${c.diffs ? c.diffs.join('; ') : ''}`)
  for (const c of d.constraints) console.log(`  con  ${c.kind}: [${c.type}] ${c.def}`)
  for (const c of d.indexes) console.log(`  idx  ${c.kind}: ${c.def}`)
  for (const c of d.triggers) console.log(`  trg  ${c.kind}: ${c.def}`)
  if (d.rls) console.log(`  rls  prod=${d.rls.prod} stg=${d.rls.stg}`)
}
console.log(`\nsequences only prod: ${out.sequences.onlyProd.join(', ') || '-'} | only stg: ${out.sequences.onlyStg.join(', ') || '-'}`)
