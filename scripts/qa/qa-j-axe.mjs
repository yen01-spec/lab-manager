// QA J — 실제 staging 브라우저에서 axe(WCAG2 A/AA): RegisterReagentModal / 제조사 picker / breadcrumb / 새 Lot 모달 / 모바일 hamburger / 관리자 로그인 / 재고실사 화면(학생 PC·모바일) / 실사 시작 모달
import { readFileSync } from 'node:fs'
import { browserLaunch, session, ok, note, summary, shot, adminLogin, studentLogin, waitList, BASE } from './lib.mjs'
const axeSrc = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const browser = await browserLaunch(false)
const results = []
async function axe(page, name, { include } = {}) {
  await page.evaluate(axeSrc)
  const v = await page.evaluate(async ({ include }) => {
    const r = await axe.run(include ? { include: [[include]] } : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations.map(x => ({ id: x.id, impact: x.impact, n: x.nodes.length, sample: x.nodes.slice(0, 2).map(n => n.html.slice(0, 110)) }))
  }, { include })
  const bad = v.filter(x => x.impact === 'critical' || x.impact === 'serious'), mod = v.filter(x => x.impact !== 'critical' && x.impact !== 'serious')
  results.push({ name, bad, mod })
  ok(`AXE ${name}: critical/serious = ${bad.length}${bad.length ? ' → ' + bad.map(b => `${b.id}(${b.n})`).join(', ') : ''}; minor/moderate ${mod.length}${mod.length ? ' (' + mod.map(b => `${b.id}(${b.n})`).join(', ') + ')' : ''}`, bad.length === 0, bad)
}
const vrow = page => page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 } })

// ── 학생 데스크톱: 등록 모달 / picker / 상세(breadcrumb) / 새 Lot 모달 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  await axe(page, 'Reagent List (desktop)')
  await page.getByRole('button', { name: /신규 시약 등록/ }).click(); await page.waitForTimeout(600)
  await axe(page, 'RegisterReagentModal — 신규 시약 등록 tab')
  await page.locator('label:has-text("제조사") + div input').first().click(); await page.getByTestId('company-picker-popup').waitFor()
  await axe(page, 'RegisterReagentModal + manufacturer picker popup open')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '직접 제조 시약 등록' }).click(); await page.waitForTimeout(400)
  await axe(page, 'RegisterReagentModal — 직접 제조 tab')
  await page.keyboard.press('Escape'); await page.mouse.click(5, 5)
  await page.goto(`${BASE}/reagents/list?q=QA-FINAL%20Move`, { waitUntil: 'domcontentloaded' }); await waitList(page)
  const p = await vrow(page); await page.mouse.click(p.x, p.y); await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1000)
  await axe(page, 'Breadcrumb region on the reagent detail page', { include: 'nav[aria-label="현재 위치"]' })
  await axe(page, 'Reagent detail page')
  await page.getByRole('button', { name: '📦 새 Lot 추가' }).click(); await page.waitForTimeout(500)
  await axe(page, 'Reagent detail — 새 Lot 추가 modal')
  await page.keyboard.press('Escape')
  ok('desktop axe flows: no production, console errors 0', rec.prod.length === 0 && rec.console.filter(c => c.t === 'error').length === 0, rec.console.slice(0, 3))
  // ── 학생 재고실사 화면 (데스크톱) — 활성 세션(AXE 세션) ──
  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: /실사 입력 시작|실사 이어서 진행/ }).waitFor({ timeout: 25000 })
  await axe(page, 'Inventory main (student, desktop)')
  await page.getByRole('button', { name: /실사 입력 시작|실사 이어서 진행/ }).click(); await page.locator('input[placeholder^="QA-INV-"]').first().waitFor({ timeout: 25000 }); await page.waitForTimeout(1200)
  await axe(page, 'Inventory count view (student, desktop table)')
  await ctx.close()
}
// ── 모바일 ──
{
  const { ctx, page } = await session(browser, { w: 390, h: 844 })
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  await page.getByRole('button', { name: '메뉴 열기' }).click(); await page.waitForTimeout(400)
  await axe(page, 'Mobile hamburger drawer (open)')
  await page.getByRole('button', { name: '관리자 로그인' }).click(); await page.getByRole('dialog').filter({ hasText: '관리자 로그인' }).waitFor()
  await axe(page, 'Admin login modal (mobile 390)')
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: /실사 입력 시작|실사 이어서 진행/ }).waitFor({ timeout: 25000 })
  await axe(page, 'Inventory main (student, mobile)')
  await page.getByRole('button', { name: /실사 입력 시작|실사 이어서 진행/ }).click(); await page.waitForTimeout(2000)
  await axe(page, 'Inventory count view — list (student, mobile)')
  await page.getByText(/QA-INV-A1/).first().click(); await page.waitForTimeout(1200)
  await axe(page, 'Inventory count view — compare panel (student, mobile)')
  await ctx.close()
}
// ── 관리자: 실사 취소(정상 workflow) 후 시작 모달 axe ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await adminLogin(page)
  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: /실사 취소/ }).waitFor({ timeout: 25000 })
  await axe(page, 'Inventory main (admin, active session)')
  await page.getByRole('button', { name: /실사 취소/ }).click(); await page.getByText(/진행 중인 실사 없음/).waitFor({ timeout: 20000 })
  ok('AXE session cancelled through the normal admin workflow (QA cleanup of the axe-only session)', (rec.dialogs || []).some(d => d.msg.includes('실사가 취소되었습니다')), (rec.dialogs || []).slice(-1))
  await page.getByRole('button', { name: /실사 시작/ }).click(); await page.waitForTimeout(600)
  await axe(page, 'Inventory start-session modal (admin)')
  ok('admin axe flow: no production', rec.prod.length === 0)
  await ctx.close()
}
await browser.close()
console.log('\nSUMMARY of critical/serious:'); for (const r of results) if (r.bad.length) console.log(' ', r.name, JSON.stringify(r.bad))
summary()
