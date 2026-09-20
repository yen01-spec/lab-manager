// STAGING QA 전용 — 실제 브라우저 QA 용 데이터 생성/정리. production 에는 절대 쓰지 않는다(ref 가 staging 이 아니면 즉시 중단).
//   bash scripts/staging/run-with-key.sh scripts/qa/qa-staging-data.mjs seed   → QA 데이터 + QA 관리자(Auth) + QA 학생 생성, 자격증명은 scratchpad 파일로만 저장
//   bash scripts/staging/run-with-key.sh scripts/qa/qa-staging-data.mjs clean  → QA 로 만든 모든 것 삭제(시약·Lot·위치·요청·이력·QA 계정)
// 태그: reagents.notes = 'QA-BROWSER-20260924', locations.room 접두 'QA-', 학생 QA-STU-*, 관리자 이메일 qa-admin-*@staging.test
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { computeSortLetter } from '../../src/lib/sortLetter.js'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'

const TAG = 'QA-BROWSER-20260924'
const STATE = process.env.QA_STATE_FILE
if (!STATE) throw new Error('QA_STATE_FILE 환경변수(scratchpad 경로)가 필요합니다.')
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
const ref = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]
if (ref === PRODUCTION_PROJECT_REF || ref !== STAGING_PROJECT_REF) throw new Error(`[FATAL] ref(${ref}) is not staging`)
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const must = (r, m) => { if (r.error) throw new Error(`${m}: ${r.error.message}`); return r.data }
const mode = process.argv[2]

if (mode === 'seed') {
  if (existsSync(STATE)) throw new Error('이미 seed 되어 있습니다(상태 파일 존재). 먼저 clean 하세요.')
  const t0 = new Date().toISOString()
  const locs = must(await s.from('locations').insert([
    { room: 'QA-5호관 101', detail: '시약장 A' }, { room: 'QA-5호관 101', detail: '시약장 B' },
    { room: 'QA-5호관 102', detail: null }, { room: 'QA-냉장실', detail: null },
  ]).select('id, room, detail'), 'locations')
  const L = { a: locs[0].id, b: locs[1].id, c: locs[2].id, cold: locs[3].id }
  const named = [
    { name: 'Acetic acid', name_ko: '아세트산', cas_no: '64-19-7', company: 'Daejung', purity: '99%', category: '액체', volume: 500, unit: 'mL', lots: [[L.a, 1, 100, 'QA-SAME'], [L.a, 0, 40, 'QA-SAME'], [L.cold, 1, 100, 'QA-X9']] },
    { name: 'Acetic acid', name_ko: '아세트산', cas_no: '64-19-7', company: 'Sigma-Aldrich', purity: '99.7%', category: '액체', volume: 1, unit: 'L', lots: [[L.b, 1, 100, 'QA-S1']] },
    { name: 'Acetone', name_ko: '아세톤', cas_no: '67-64-1', company: 'Samchun', purity: '99.5%', category: '액체', volume: 500, unit: 'mL', lots: [[L.a, 1, 100, 'QA-AC1']] },
    { name: 'Bromothymol blue', name_ko: '브로모티몰블루', cas_no: '76-59-5', company: 'TCI', purity: '95%', category: '고체', volume: 25, unit: 'g', lots: [[L.b, 1, 100, 'QA-BTB1']] },
    { name: 'Thymol blue', name_ko: '티몰블루', cas_no: '76-61-9', company: 'TCI', category: '고체', volume: 5, unit: 'g', lots: [[L.b, 0, 60, 'QA-TB1']] },
    { name: 'Thymolphthalein', name_ko: '티몰프탈레인', cas_no: '125-20-2', company: 'Junsei', category: '고체', volume: 25, unit: 'g', lots: [[L.b, 1, 100, 'QA-TP1']] },
    { name: 'Iron(III) chloride', name_ko: '염화철(III)', cas_no: '7705-08-0', company: 'Duksan', category: '고체', volume: 500, unit: 'g', lots: [[L.c, 1, 100, 'QA-FE1']] },
    { name: 'Benzene', name_ko: '벤젠', cas_no: '71-43-2', company: 'Daejung', category: '액체', volume: 500, unit: 'mL', lots: [[L.a, 1, 100, 'QA-BZ1']] },
    { name: 'Acridine orange', name_ko: '아크리딘 오렌지', cas_no: '65-61-2', company: 'Sigma-Aldrich', purity: '95%', category: '고체', volume: 25, unit: 'g', lots: [[L.b, 0, 15, 'QA-LOW1']] },
    { name: 'Sodium chloride', name_ko: '염화나트륨', cas_no: '7647-14-5', company: 'Samchun', category: '고체', volume: 500, unit: 'g', lots: [[L.c, 3, 100, 'QA-GROUPED']] },   // 묶음 행(sealed 3) — fail-closed UI 확인용
    { name: 'Ethanol', name_ko: '에탄올', cas_no: '64-17-5', company: 'Samchun', category: '액체', volume: 500, unit: 'mL', lots: [[L.a, 1, 100, 'QA-ET1']] },
    { name: 'Ethanol', name_ko: '에탄올', cas_no: '64-17-5', company: 'Daejung', category: '액체', volume: 500, unit: 'mL', lots: [[L.a, 1, 100, 'QA-ET2'], [L.cold, 0, 30, 'QA-ET3']] },
    { name: 'Ethanol', name_ko: '에탄올', cas_no: '64-17-5', company: 'Duksan', category: '액체', volume: 1, unit: 'L', lots: [[L.c, 1, 100, 'QA-ET4']] },
    { name: 'N,N-Dimethylformamide', name_ko: '디메틸포름아미드', cas_no: '68-12-2', company: 'Daejung', category: '액체', lots: [[L.b, 1, 100, 'QA-DMF']] },
    { name: 'tert-Butanol', name_ko: '터트부탄올', cas_no: '75-65-0', company: 'TCI', category: '액체', lots: [[L.b, 1, 100, 'QA-TBU']] },
    { name: 'n-Hexane', name_ko: '노말헥산', cas_no: '110-54-3', company: 'Duksan', category: '액체', lots: [[L.a, 1, 100, 'QA-HEX']] },
    { name: '(±)-Camphor', name_ko: '캄퍼', cas_no: '76-22-2', company: 'Sigma-Aldrich', category: '고체', lots: [[L.b, 1, 100, 'QA-CAM']] },
    { name: '2-Propanol', name_ko: '2-프로판올', cas_no: '67-63-0', company: 'Daejung', category: '액체', lots: [[L.a, 1, 100, 'QA-IPA']] },
    { name: 'D-Glucose', name_ko: '포도당', cas_no: '50-99-7', company: 'Junsei', category: '고체', lots: [[L.c, 1, 100, 'QA-GLU']] },
  ]
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const fillers = []
  for (let i = 0; i < 300; i++) {
    const l = LET[i % 26]
    fillers.push({ name: `${l}${String(i).padStart(3, '0')} QA compound`, name_ko: `큐에이 시약 ${i}`, cas_no: `9${String(1000 + i)}-${String(i % 90).padStart(2, '0')}-${i % 10}`, company: i % 2 ? 'Daejung' : 'Samchun', category: i % 3 ? '액체' : '고체',
      lots: [[[L.a, L.b, L.c, L.cold][i % 4], (i % 5 === 0 ? 0 : 1), (i % 5 === 0 ? 10 + (i % 60) : 100), `QA-F${i}`], ...(i % 4 === 0 ? [[[L.b, L.cold, L.a, L.c][i % 4], 1, 100, `QA-F${i}-2`]] : [])] })
  }
  const all = [...named, ...fillers]
  const rrows = all.map(r => ({ name: r.name, name_ko: r.name_ko, cas_no: r.cas_no, company: r.company, purity: r.purity ?? null, category: r.category, volume: r.volume ?? null, unit: r.unit ?? null,
    reagent_type: 'purchased', status: 'active', notes: TAG, sort_letter: computeSortLetter(r.name) }))
  const ids = []
  for (let i = 0; i < rrows.length; i += 100) ids.push(...must(await s.from('reagents').insert(rrows.slice(i, i + 100)).select('id'), 'reagents').map(x => x.id))
  const lrows = []
  all.forEach((r, i) => r.lots.forEach(([loc, sealed, stock, no]) => lrows.push({ reagent_id: ids[i], location_id: loc, status: 'active', sealed_count: sealed, current_stock: stock, lot_no: no, cat_no: 'QA-CAT', received_date: '2026-01-15', lot_source: 'manual' })))
  for (let i = 0; i < lrows.length; i += 100) must(await s.from('reagent_lots').insert(lrows.slice(i, i + 100)), 'lots')
  // QA 학생 + QA 관리자(Auth) — 자격증명은 상태 파일(저장소 밖)에만 기록
  const stu = { student_id: 'QA-STU-9001', name: 'QA 학생', birth: '2000-01-01' }
  must(await s.from('students').insert({ student_id: stu.student_id, name: stu.name, birth_date: stu.birth }), 'student')
  const PW = 'Qa!' + randomBytes(9).toString('hex')
  const email = `qa-admin-${randomBytes(3).toString('hex')}@staging.test`
  const au = must(await s.auth.admin.createUser({ email, password: PW, email_confirm: true }), 'admin auth')
  must(await s.from('admin_users').insert({ user_id: au.user.id, active: true, note: TAG }), 'admin_users')
  mkdirSync(new URL('.', 'file:///' + STATE.replace(/\\/g, '/')).pathname.replace(/^\//, ''), { recursive: true })
  writeFileSync(STATE, JSON.stringify({ tag: TAG, t0, admin: { email, password: PW, user_id: au.user.id }, student: stu, locations: locs.map(l => l.id), reagentCount: ids.length, lotCount: lrows.length }, null, 2))
  console.log(`seeded: reagents=${ids.length} lots=${lrows.length} locations=${locs.length}; QA admin + QA student created (credentials in state file)`)
} else if (mode === 'clean') {
  const st = JSON.parse(readFileSync(STATE, 'utf-8'))
  const rIds = []
  for (let from = 0; ; from += 1000) { const d = must(await s.from('reagents').select('id').eq('notes', TAG).range(from, from + 999), 'reagent ids'); rIds.push(...d.map(x => x.id)); if (d.length < 1000) break }
  // 상세 화면에서 QA 가 만든 새 Lot 도 reagent_lots 에 QA 시약 아래 생기므로 cascade 로 함께 정리된다.
  const lotIds = []
  for (let i = 0; i < rIds.length; i += 100) lotIds.push(...must(await s.from('reagent_lots').select('id').in('reagent_id', rIds.slice(i, i + 100)), 'lot ids').map(x => x.id))
  const del = async (t, col, ids) => { for (let i = 0; i < ids.length; i += 100) { const r = await s.from(t).delete().in(col, ids.slice(i, i + 100)); if (r.error && !/does not exist|schema cache/.test(r.error.message)) console.log(`  warn ${t}: ${r.error.message}`) } }
  for (const t of ['location_requests', 'disposal_requests', 'reagent_change_requests', 'location_history', 'reagent_import_history']) await del(t, 'reagent_id', rIds)
  await del('stock_logs', 'lot_id', lotIds); await del('stock_history', 'lot_id', lotIds)
  await del('reagents', 'id', rIds)   // reagent_lots cascade
  await s.from('locations').delete().like('room', 'QA-%')
  await s.from('students').delete().eq('student_id', st.student.student_id)
  await s.from('admin_users').delete().eq('user_id', st.admin.user_id)
  await s.auth.admin.deleteUser(st.admin.user_id)
  await s.from('admin_logs').delete().gte('created_at', st.t0)
  console.log(`cleaned: reagents=${rIds.length} lots=${lotIds.length}`)
  writeFileSync(STATE + '.cleaned', new Date().toISOString())
} else throw new Error('usage: seed | clean')
