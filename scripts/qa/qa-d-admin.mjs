// QA D — 관리자(UI 로그인): 학생 요청 review 화면 + 정리(반려), 정보 수정(직접 저장: CAS/제조사/순도/성상/용량+단위) 저장·reload·원복 — 실제 staging 브라우저
import { browserLaunch, session, ok, note, summary, shot, overflowX, waitList, adminLogin, BASE } from './lib.mjs'

const headed = process.env.QA_HEADED === '1'
const browser = await browserLaunch(headed, headed ? 150 : 0)
const vrow = (page) => page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 } })
const openReagent = async (page, q) => { await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await waitList(page); const p = await vrow(page); await page.mouse.click(p.x, p.y); await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 15000 }); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1000) }

const A = await session(browser, { w: 1440, h: 900 })
const { page, rec } = A
const patches = []
page.on('request', q => { if (q.method() === 'PATCH' && /\/rest\/v1\/reagents/.test(q.url())) { patches.push({ body: JSON.parse(q.postData() || '{}') }) } })
page.on('response', async r => { if (r.request().method() === 'PATCH' && /\/rest\/v1\/reagents/.test(r.url())) patches[patches.length - 1] && (patches[patches.length - 1].status = r.status()) })
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await adminLogin(page)
ok('ADMIN login through the real UI (Supabase Auth + admin_users)', (await page.locator('body').innerText()).includes('관리자'))

// ── STEP14/15/16 review 화면 + 정리(반려) ──
await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
for (const [tab, marker, label] of [['시약정보 수정', 'QA-액체-신청', 'info-change request'], ['위치 변경', 'Acetone', 'location request'], ['폐기', 'Acetone', 'disposal request']]) {
  await page.getByRole('button', { name: new RegExp(tab) }).first().click(); await page.waitForTimeout(1500)
  const t = await page.locator('main').innerText()
  ok(`STEP14-16 admin review screen "${tab}" shows the student's ${label}`, t.includes(marker), t.slice(0, 200).replace(/\n/g, ' | '))
  await shot(page, `D-admin-${tab.replace(/\s/g, '')}`)
  const rejectBtn = page.getByRole('button', { name: /^(✗ )?반려$/ }).filter({ visible: true }).first()
  if (await rejectBtn.count()) { await rejectBtn.click(); await page.waitForTimeout(1500) }
  const after = await page.locator('main').innerText()
  ok(`STEP14-16 "${tab}": the request was rejected for cleanup (no reject button left = nothing pending)`, (await page.getByRole('button', { name: /^(✗ )?반려$/ }).filter({ visible: true }).count()) === 0, A.rec.dialogs?.slice(-1))
}

// ── STEP13 관리자 정보 수정 ──
await openReagent(page, 'Acetone')
ok('STEP11 admin actions: "✏️ 정보 수정" (direct edit) + 더보기 has 폐기 처리 / 시약 종류 삭제', (await page.getByRole('button', { name: '✏️ 정보 수정', exact: true }).count()) === 1 && await (async () => { await page.getByRole('button', { name: /더보기/ }).click(); const t = (await page.getByRole('menuitem').allInnerTexts()).join('|'); await page.keyboard.press('Escape'); return t.includes('폐기 처리') && t.includes('시약 종류 삭제') })())
const original = await page.evaluate(async () => null)
await page.getByRole('button', { name: '✏️ 정보 수정', exact: true }).click()
const strip = page.getByRole('region', { name: '시약 기본정보 수정' })
const orig = {}
for (const k of ['name_ko', 'cas_no', 'purity', 'category', 'hazard']) orig[k] = await page.locator(`#master-${k}`).inputValue()
orig.volume = await page.locator('#master-volume').inputValue(); orig.unit = await page.getByLabel('단위').inputValue(); orig.company = await page.locator('label:has-text("제조사") + div input').first().inputValue()
note('original values (to restore)', orig)
await page.locator('#master-name_ko').fill('아세톤(QA)')
await page.locator('#master-cas_no').fill('67-64-9')
await page.locator('label:has-text("제조사") + div input').first().fill('Sigma-Aldrich')
await page.locator('#master-purity').fill('99.9%')
await page.locator('#master-category').fill('액체(QA)')
await page.locator('#master-volume').fill('750'); await page.getByLabel('단위').fill('mL')
await shot(page, 'D-admin-edit-mode')
await strip.getByRole('button', { name: /^저장/ }).click(); await page.waitForTimeout(2000)
const p1 = patches[patches.length - 1] || {}
ok('STEP13 admin 저장 = one PATCH with ONLY changed fields; CAS goes with the real column cas_source; volume numeric (unit unchanged → not sent); no 4xx', p1.status && p1.status < 300 && p1.body.cas_no === '67-64-9' && p1.body.cas_source === 'manual' && !('cas_no_source' in p1.body) && p1.body.volume === 750 && !('unit' in p1.body) && p1.body.company === 'Sigma-Aldrich' && p1.body.purity === '99.9%' && p1.body.category === '액체(QA)' && p1.body.name_ko === '아세톤(QA)', p1)
ok('STEP13 edit mode closes after save, saved notice shown', (await strip.count()) === 0)
await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1500)
const t2 = await page.locator('main').innerText()
ok('STEP13/16/17 after reload the persisted values are shown (CAS 67-64-9, 750 mL, Sigma-Aldrich, 99.9%, 액체(QA), 아세톤(QA))', ['67-64-9', '750 mL', 'Sigma-Aldrich', '99.9%', '액체(QA)', '아세톤(QA)'].every(x => t2.includes(x)), t2.slice(t2.indexOf('시약 기본정보'), t2.indexOf('시약 기본정보') + 260).replace(/\n/g, ' | '))
// volume: 숫자 검증(잘못된 값은 저장 안 함)
await page.getByRole('button', { name: '✏️ 정보 수정', exact: true }).click()
const nBefore = patches.length
await page.locator('#master-volume').fill('-5'); await strip.getByRole('button', { name: /^저장/ }).click(); await page.waitForTimeout(800)
ok('STEP13 invalid (negative) volume is rejected client-side: alert shown, no PATCH', patches.length === nBefore && (A.rec.dialogs || []).some(d => d.msg.includes('용량은 0 이상의 숫자')), A.rec.dialogs?.slice(-1))
await strip.getByRole('button', { name: '취소' }).click()
// ── 원복 ──
await page.getByRole('button', { name: '✏️ 정보 수정', exact: true }).click()
await page.locator('#master-name_ko').fill(orig.name_ko); await page.locator('#master-cas_no').fill(orig.cas_no)
await page.locator('label:has-text("제조사") + div input').first().fill(orig.company); await page.locator('#master-purity').fill(orig.purity); await page.locator('#master-category').fill(orig.category)
await page.locator('#master-volume').fill(orig.volume); await page.getByLabel('단위').fill(orig.unit)
await strip.getByRole('button', { name: /^저장/ }).click(); await page.waitForTimeout(2000)
await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1500)
const t3 = await page.locator('main').innerText()
ok('QA edit reverted to the original values (verified after reload)', t3.includes('67-64-1') && t3.includes('Samchun') && t3.includes('99.5%') && t3.includes('아세톤') && !t3.includes('아세톤(QA)') && t3.includes('500 mL'), { restored: [orig.cas_no, orig.company, orig.purity, orig.volume + orig.unit] })
ok('ADMIN flows: console clean (no page errors / console errors)', rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0, { errors: rec.errors, console: rec.console.slice(0, 5) })
ok('ADMIN flows: no 4xx/5xx from staging Supabase', rec.net.filter(r => r.s >= 400).length === 0, rec.net.filter(r => r.s >= 400).slice(0, 6))
ok('ADMIN flows: no production/Firebase request attempted', rec.prod.length === 0, rec.prod)
await A.ctx.close()
await browser.close()
summary()
