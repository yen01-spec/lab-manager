// STAGING QA 전용 — 긴 화학명 시약 1건(QA 태그) 추가. clean 시 함께 삭제된다.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: loc } = await s.from('locations').select('id').eq('room', 'QA-5호관 102').single()
const { data: r, error } = await s.from('reagents').insert({ name: 'Tris(hydroxymethyl)aminomethane hydrochloride extra-pure grade reagent solution 0.5 mol/L in ultrapure water for molecular biology', name_ko: '트리스(하이드록시메틸)아미노메탄 염산염 분자생물학용 초순수 0.5 M 용액', cas_no: '1185-53-1', company: 'Sigma-Aldrich', category: '액체', reagent_type: 'purchased', status: 'active', notes: 'QA-BROWSER-20260924', sort_letter: 'T' }).select('id').single()
if (error) throw error
await s.from('reagent_lots').insert({ reagent_id: r.id, location_id: loc.id, status: 'active', sealed_count: 1, current_stock: 100, lot_no: 'QA-LONG-1', lot_source: 'manual' })
console.log('long-name QA reagent added')
