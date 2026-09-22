// STAGING 전용 — resourceGuides.js(코드 하드코딩) 콘텐츠를 resource_tabs/resource_articles로 이관.
// migration이 아니라 1회성 데이터 스크립트(참고: docs/OPERATIONS.md 자료실 CMS 절). 의미를 새로
// 요약하지 않고 title/summary/audience/timing/steps/notice를 그대로 옮긴다. reagent-search/goto
// 액션은 버리고, 'route' 액션(있으면 우선) 또는 'school'/'kosha' 공식 링크 중 1개만 link로 남긴다.
// resource-articles-seed-data.json은 옛 src/lib/resourceGuides.js(자료실 CMS 전환 전 하드코딩 콘텐츠,
// 참조 0 확인 후 삭제됨)의 ALL_RESOURCE_SECTIONS를 그대로 얼려 둔 스냅샷이다 — 의미를 새로 요약하지
// 않고 title/summary/audience/timing/steps/notice를 원문 그대로 옮기기 위해 소스 삭제 후에도 이
// 스크립트가 재실행 가능하도록 데이터를 분리해 둔다.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const ALL_RESOURCE_SECTIONS = JSON.parse(readFileSync(new URL('./resource-articles-seed-data.json', import.meta.url), 'utf-8'))

const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SCHOOL_SAFETY_SYSTEM_FALLBACK = 'https://safety.kangwon.ac.kr/'
const KOSHA_LABEL_FALLBACK = 'https://msds.kosha.or.kr/'
const { data: settingsRows } = await s.from('app_settings').select('key, value').in('key', ['school_safety_system_url', 'kosha_label_url'])
const settingsMap = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]))
const officialUrl = { school: settingsMap.school_safety_system_url || SCHOOL_SAFETY_SYSTEM_FALLBACK, kosha: settingsMap.kosha_label_url || KOSHA_LABEL_FALLBACK }

const GROUP_TAB_NAME = { safety: '안전·폐기', forms: '서식·양식', ops: '연구실 운영' }
const TAB_ORDER = ['안전·폐기', '서식·양식', '연구실 운영']

function deriveLink(section) {
  const actions = section.actions || []
  const routeAction = actions.find(a => a.type === 'route')
  if (routeAction) return { link_label: `${routeAction.label} →`, link_url: routeAction.to }
  const officialAction = actions.find(a => a.key === 'school' || a.key === 'kosha')
  if (officialAction) return { link_label: `${officialAction.label} ↗`, link_url: officialUrl[officialAction.key] }
  return { link_label: null, link_url: null }
}

console.log(`source: ${ALL_RESOURCE_SECTIONS.length} sections from resourceGuides.js`)

// ── 1) 탭 3개 (없으면 생성, 있으면 재사용 — 재실행해도 중복 생성 안 함) ──
const tabIdByName = {}
for (let i = 0; i < TAB_ORDER.length; i++) {
  const name = TAB_ORDER[i]
  const { data: existing } = await s.from('resource_tabs').select('id').eq('name', name).maybeSingle()
  if (existing) { tabIdByName[name] = existing.id; continue }
  const { data: created, error } = await s.from('resource_tabs').insert({ name, sort_order: i }).select('id').single()
  if (error) throw new Error(`탭 생성 실패(${name}): ${error.message}`)
  tabIdByName[name] = created.id
}
console.log('tabs:', tabIdByName)

// ── 2) 이미 이 legacy key로 이관된 글이 있으면 건너뜀(재실행 안전) ──
const { data: existingArticles } = await s.from('resource_articles').select('legacy_category_key, legacy_section_key')
const already = new Set((existingArticles || []).map(a => `${a.legacy_category_key}.${a.legacy_section_key}`))

let created = 0, skipped = 0
const bySortWithinTab = {}
for (const section of ALL_RESOURCE_SECTIONS) {
  const key = `${section.categoryKey}.${section.key}`
  if (already.has(key)) { skipped++; continue }
  const tabName = GROUP_TAB_NAME[section.group]
  if (!tabName) throw new Error(`매핑되지 않은 group: ${section.group} (${key})`)
  const tabId = tabIdByName[tabName]
  const sortOrder = (bySortWithinTab[tabName] = (bySortWithinTab[tabName] ?? -1) + 1)
  const { link_label, link_url } = deriveLink(section)
  const row = {
    tab_id: tabId,
    title: section.title,
    summary: section.summary || null,
    audience: section.audience || null,
    timing: section.timing || null,
    steps: section.steps || [],
    notice: section.notice || null,
    link_label, link_url,
    sort_order: sortOrder,
    legacy_category_key: section.categoryKey,
    legacy_section_key: section.key,
  }
  const { error } = await s.from('resource_articles').insert(row)
  if (error) throw new Error(`글 이관 실패(${key}): ${error.message}`)
  created++
}
console.log(`articles: created=${created} skipped(already migrated)=${skipped}`)

// ── 3) resource_files.article_id backfill(legacy category_key+section_key 매칭) ──
const { data: allArticles } = await s.from('resource_articles').select('id, legacy_category_key, legacy_section_key')
const articleIdByLegacy = new Map(allArticles.map(a => [`${a.legacy_category_key}.${a.legacy_section_key}`, a.id]))
const { data: filesToBackfill } = await s.from('resource_files').select('id, category_key, section_key').is('article_id', null).not('category_key', 'is', null)
let backfilled = 0
const unmapped = []
for (const f of filesToBackfill || []) {
  const aid = articleIdByLegacy.get(`${f.category_key}.${f.section_key}`)
  if (!aid) { unmapped.push(f); continue }
  const { error } = await s.from('resource_files').update({ article_id: aid }).eq('id', f.id)
  if (error) throw new Error(`backfill 실패(file ${f.id}): ${error.message}`)
  backfilled++
}
console.log(`resource_files backfill: matched=${backfilled} unmapped=${unmapped.length}`)
if (unmapped.length > 0) {
  console.log('UNMAPPED ROWS (임의 배정 없이 중단·보고):', JSON.stringify(unmapped, null, 1))
  process.exitCode = 1
}

// ── 4) 검증 ──
const { count: articleCount } = await s.from('resource_articles').select('id', { count: 'exact', head: true })
const { count: orphanCount } = await s.from('resource_files').select('id', { count: 'exact', head: true }).is('article_id', null)
console.log(`VERIFY: resource_articles total=${articleCount} (expect 30) / resource_files with article_id IS NULL=${orphanCount}`)
