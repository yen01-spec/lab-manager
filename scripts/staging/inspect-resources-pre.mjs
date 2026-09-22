// STAGING 읽기 전용 — resource_files / notices 현재 상태 조사 (쓰기 없음)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: rf, count: rfCount } = await s.from('resource_files').select('id, category_key, section_key, storage_path, is_current', { count: 'exact' })
console.log('resource_files total:', rfCount)
const pairs = new Map()
for (const r of rf || []) { const k = `${r.category_key}.${r.section_key}`; pairs.set(k, (pairs.get(k) || 0) + 1) }
console.log('distinct category_key.section_key pairs:', pairs.size)
console.log(JSON.stringify([...pairs.entries()].sort(), null, 1))

const KNOWN_PAIRS = new Set([
  'waste.flow', 'waste.reagent', 'waste.liquid', 'waste.solid', 'waste.mix-forbid', 'waste.characterize', 'waste.pickup', 'waste.classify',
  'special.targets', 'special.register', 'special.handling', 'special.log', 'special.sign',
  'prior.flow', 'prior.status', 'prior.risk', 'prior.rndsa', 'prior.ledger', 'prior.prepare',
  'signage.small-container', 'signage.ghs', 'signage.safety-sign', 'signage.ppe',
  'ops.chem-register', 'ops.daily-check', 'ops.incident', 'ops.rules', 'ops.edu', 'ops.regulation', 'ops.roles',
])
const unmapped = [...pairs.keys()].filter(k => !KNOWN_PAIRS.has(k))
console.log('rows with category_key.section_key NOT in the 30 known resourceGuides pairs:', unmapped.length, unmapped)

const { count: noticeCount } = await s.from('notices').select('id', { count: 'exact', head: true }).eq('type', 'notice')
const { count: safetyCount } = await s.from('notices').select('id', { count: 'exact', head: true }).eq('type', 'safety')
const { count: noticeFilesCount } = await s.from('notice_files').select('id', { count: 'exact', head: true })
console.log('notices type=notice:', noticeCount, ' type=safety:', safetyCount, ' notice_files total:', noticeFilesCount)
