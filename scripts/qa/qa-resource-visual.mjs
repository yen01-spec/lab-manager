// 자료실 실브라우저 QA 2/2 — 실제 30개 글 콘텐츠 기준 desktop/mobile 시각 확인 + axe + 공지 UI 없음.
import { readFileSync } from 'node:fs'
import { browserLaunch, session, ok, note, summary, shot, overflowX, adminLogin, BASE } from './lib.mjs'
const axeSrc = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

const browser = await browserLaunch(false)

// ── Desktop ──
for (const [w, h] of [[1440, 900], [1366, 768]]) {
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  const tabNames = await page.getByRole('tablist', { name: '자료실 탭' }).getByRole('tab').allInnerTexts()
  ok(`[${w}x${h}] 첫 화면 탭 = 전체 + 실제 DB 탭 3개(안전·폐기/서식·양식/연구실 운영)`, tabNames.join(',') === '전체,안전·폐기,서식·양식,연구실 운영', tabNames)
  const cardCount = await page.locator('section[aria-labelledby^="article-"]').count()
  ok(`[${w}x${h}] "전체"에서 실제 이관된 글 30개 모두 보임`, cardCount === 30, cardCount)
  ok(`[${w}x${h}] 공지사항 관련 카드/탭 없음`, (await page.getByText('공지사항 게시판').count()) === 0)
  await shot(page, `visual-${w}x${h}-all`)
  ok(`[${w}x${h}] 가로 overflow 없음`, (await overflowX(page)) <= 0)
  ok(`[${w}x${h}] console/production 이상 없음`, rec.errors.length === 0 && rec.prod.length === 0, { errors: rec.errors.slice(0, 3), prod: rec.prod })
  await ctx.close()
}

// ── Mobile ──
for (const [w, h] of [[390, 844], [360, 800]]) {
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  await shot(page, `visual-${w}x${h}-all`)
  ok(`[${w}x${h}] 가로 overflow 없음(탭 chip/긴 제목/여러 첨부)`, (await overflowX(page)) <= 0)
  const tablist = page.getByRole('tablist', { name: '자료실 탭' })
  await tablist.getByRole('tab', { name: '서식·양식' }).click()
  await page.waitForTimeout(500)
  await shot(page, `visual-${w}x${h}-forms-tab`)
  ok(`[${w}x${h}] 탭 전환 후에도 overflow 없음`, (await overflowX(page)) <= 0)
  ok(`[${w}x${h}] console/production 이상 없음`, rec.errors.length === 0 && rec.prod.length === 0, { errors: rec.errors.slice(0, 3), prod: rec.prod })
  await ctx.close()
}

// ── Accessibility(axe) — 관리자 컨트롤 포함, 실제 콘텐츠 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await adminLogin(page)
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  await page.evaluate(src => { (0, eval)(src) }, axeSrc)
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    return r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious').map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, html: v.nodes[0].html.slice(0, 140) }))
  })
  ok('axe critical/serious = 0(실제 30개 글 + 관리자 컨트롤, 전체 탭)', violations.length === 0, violations)

  // 탭 관리 모달도 포함
  await page.getByRole('button', { name: '탭 관리' }).click()
  await page.getByRole('dialog', { name: '탭 관리' }).waitFor({ timeout: 10000 })
  await page.waitForTimeout(300)
  const violations2 = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    return r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious').map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length }))
  })
  ok('axe critical/serious = 0(탭 관리 모달 열린 상태)', violations2.length === 0, violations2)
  ok('production 접속 없음(이번 세션)', rec.prod.length === 0, rec.prod)
  await ctx.close()
}

await browser.close()
summary()
