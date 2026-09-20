// STAGING QA — 공지 상세 breadcrumb(STEP22). QA 공지 1건을 만들어 확인하고 바로 삭제한다.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { browserLaunch, session, ok, summary, crumbText, BASE } from './lib.mjs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
if (!/vvafhcqypvejvsuksooi/.test(env.VITE_SUPABASE_URL)) throw new Error('not staging')
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: n, error } = await s.from('notices').insert({ title: 'QA-BROWSER 공지', content: 'QA 임시 공지 — 자동 삭제', type: 'notice' }).select('id').single()
if (error) throw error
try {
  const browser = await browserLaunch(false)
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(`${BASE}/notices/${n.id}`, { waitUntil: 'domcontentloaded' })
  await page.locator('nav[aria-label="현재 위치"]').waitFor({ timeout: 20000 }); await page.waitForTimeout(1200)
  const t = await crumbText(page)
  ok('STEP22 notice detail: "홈 › 공지사항 › QA-BROWSER 공지" (middle crumb is a link to /notices, last is aria-current)', t === '홈 › 공지사항 › QA-BROWSER 공지' && (await page.locator('nav[aria-label="현재 위치"] a').count()) === 2 && (await page.locator('nav[aria-label="현재 위치"] [aria-current="page"]').count()) === 1, t)
  await page.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '공지사항' }).click(); await page.waitForURL(/\/notices$/)
  ok('STEP22 notice detail crumb "공지사항" navigates to /notices', new URL(page.url()).pathname === '/notices')
  ok('notice pages: console clean, no production contact', rec.errors.length === 0 && rec.prod.length === 0 && rec.console.filter(x => x.t === 'error').length === 0, { e: rec.errors, c: rec.console.filter(x => x.t === 'error').slice(0, 3) })
  await ctx.close(); await browser.close()
} finally {
  await s.from('notices').delete().eq('id', n.id)
  console.log('QA notice deleted')
}
summary()
