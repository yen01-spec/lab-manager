// STAGING 실제 브라우저 QA 공통 — mock 없음(실제 staging frontend + 실제 staging Supabase).
// 안전장치: production Supabase ref / Firebase 로 향하는 요청은 브라우저에서 즉시 차단하고 개수를 센다(정상이면 0).
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { CHROME } from '../ui/harness.mjs'
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from '../supabase-refs.mjs'

export const BASE = 'http://localhost:5299'
export const STATE = JSON.parse(readFileSync(process.env.QA_STATE_FILE, 'utf-8'))
const OUT = process.env.QA_OUT
mkdirSync(OUT, { recursive: true })
// 스크린샷 실패(폰트 로딩 타임아웃 등 환경 플레이크)가 전체 스위트를 죽이지 않게 — 증거 첨부일 뿐 assertion이 아니다.
export const shot = async (page, name) => { try { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false, timeout: 10000 }); return `${OUT}/${name}.png` } catch (e) { note(`shot(${name}) failed — non-fatal`, e.message); return null } }

const results = []
export const ok = (name, cond, detail) => {
  const r = { name, status: cond ? 'PASS' : 'FAIL', detail }
  results.push(r)
  appendFileSync(`${OUT}/results.jsonl`, JSON.stringify(r) + '\n')
  console.log(`[${r.status}] ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`)
}
export const note = (name, detail) => { appendFileSync(`${OUT}/results.jsonl`, JSON.stringify({ name, status: 'NOTE', detail }) + '\n'); console.log(`[NOTE] ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''}`) }
export const summary = () => { const f = results.filter(r => r.status === 'FAIL').length; console.log(`\nTOTAL=${results.length} PASS=${results.length - f} FAIL=${f}`) }

export const browserLaunch = (headed = false, slowMo = 0) => chromium.launch({ executablePath: CHROME, headless: !headed, slowMo })

// session: 실제 Supabase 로 나가는 요청/콘솔/예외를 모두 기록한다.
export async function session(browser, { w = 1440, h = 900, mobile = w < 768, throttle = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, acceptDownloads: true })
  const rec = { net: [], failed: [], console: [], errors: [], prod: [], ext: [] }
  await ctx.route(new RegExp(`${PRODUCTION_PROJECT_REF}|firebaseio\\.com|firebaseinstallations|fcm\\.googleapis|firebase\\.google`), route => { rec.prod.push(route.request().url()); route.abort() })
  const page = await ctx.newPage()
  page.on('response', r => { const u = r.url(); if (u.includes(STAGING_PROJECT_REF)) rec.net.push({ m: r.request().method(), u: u.replace(/^https:\/\/[^/]+/, ''), s: r.status() }); else if (!u.startsWith(BASE) && !u.startsWith('data:')) rec.ext.push({ u: u.slice(0, 120), s: r.status() }) })
  page.on('requestfailed', r => rec.failed.push({ u: r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 140), why: r.failure()?.errorText }))
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) rec.console.push({ t: m.type(), x: m.text().slice(0, 300) }) })
  page.on('pageerror', e => rec.errors.push(e.message))
  page.on('dialog', d => { rec.dialogs = (rec.dialogs || []).concat({ type: d.type(), msg: d.message().slice(0, 200) }); d.accept(d.type() === 'prompt' ? 'QA 반려' : undefined) })
  if (throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', throttle) }
  return { ctx, page, rec }
}

export const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
export const crumbText = async page => (await page.locator('nav[aria-label="현재 위치"]').innerText()).replace(/^home\s*/, '').replace(/\s+/g, ' ').trim()
export const resultCount = async page => { const t = await page.getByText(/^검색결과/).first().innerText(); return +((t.match(/검색결과\s*([\d,]+)/) || [])[1] || '-1').replace(/,/g, '') }
export const waitList = async page => { await page.getByText(/^검색결과/).first().waitFor({ timeout: 30000 }); await page.waitForFunction(() => !document.body.innerText.includes('시약 목록을 불러오는 중'), null, { timeout: 30000 }); await page.waitForTimeout(400) }
export const visible = loc => loc.filter({ visible: true })

export async function studentLogin(page) {
  await page.getByRole('button', { name: '로그인', exact: true }).filter({ visible: true }).first().click()
  const dlg = page.getByRole('dialog', { name: '로그인' })
  await dlg.waitFor()
  await dlg.getByPlaceholder('예) 202112345').fill(STATE.student.student_id)
  const [y, m, d] = STATE.student.birth.split('-')
  await dlg.getByPlaceholder('YYYY').fill(y); await dlg.getByPlaceholder('MM').fill(m); await dlg.getByPlaceholder('DD').fill(d)
  await dlg.getByPlaceholder('예) 이OO').fill(STATE.student.name)
  await dlg.locator('button[type=submit]').click()
  await dlg.waitFor({ state: 'hidden', timeout: 15000 })
}
export async function adminLogin(page) {
  await page.getByRole('button', { name: '관리자 로그인' }).filter({ visible: true }).first().click()
  const dlg = page.getByRole('dialog').filter({ hasText: '관리자 로그인' })
  await dlg.waitFor()
  await dlg.locator('#admin-email').fill(STATE.admin.email); await dlg.locator('#admin-pw').fill(STATE.admin.password)
  await dlg.getByRole('button', { name: '로그인', exact: true }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })
}
