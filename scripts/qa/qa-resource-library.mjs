// 자료실 CMS 실브라우저 QA — 실제 staging(관리자 Auth 계정으로 탭 생성/수정/순서/삭제 guard,
// 글 작성/수정/이동/순서/삭제 guard, 첨부파일 업로드×2/열기/교체/삭제) + 일반 화면 반영 확인.
// QA 전용 탭/글/파일만 사용, 끝나면 정리한다.
import { readFileSync } from 'node:fs'
import { browserLaunch, session, ok, note, summary, shot, adminLogin, BASE } from './lib.mjs'

const browser = await browserLaunch(process.env.QA_HEADED === '1', process.env.QA_HEADED === '1' ? 150 : 0)
const TAB_A = 'QA-LIB-tab-A-' + Date.now()
const TAB_B = 'QA-LIB-tab-B-' + Date.now()
const ARTICLE_TITLE = 'QA 자료실 글'
const FILE1 = new URL('./fixtures/qa-file-1.pdf', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const FILE2 = new URL('./fixtures/qa-file-2.pdf', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const FILE3 = new URL('./fixtures/qa-file-3.pdf', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const tabRow = (scope, name) => scope.locator('[data-tab-id]', { hasText: name })
const fileRow = (scope, title) => scope.locator('[data-file-id]', { hasText: title })

// ── 데스크톱: 관리자 CMS 전체 워크플로 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await adminLogin(page)
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await shot(page, 'lib-01-initial')

  // 1) 탭 생성
  await page.getByRole('button', { name: '탭 관리' }).click()
  const mgr = page.getByRole('dialog', { name: '탭 관리' })
  await mgr.waitFor({ timeout: 10000 })
  await mgr.getByLabel('새 탭 이름').fill(TAB_A)
  await mgr.getByRole('button', { name: '+ 탭 생성' }).click()
  await tabRow(mgr, TAB_A).waitFor({ timeout: 10000 })
  ok('STEP1 탭 생성 — "탭 관리"에서 만든 탭이 즉시 목록에 나타남', (await tabRow(mgr, TAB_A).count()) === 1)

  await mgr.getByLabel('새 탭 이름').fill(TAB_B)
  await mgr.getByRole('button', { name: '+ 탭 생성' }).click()
  await tabRow(mgr, TAB_B).waitFor({ timeout: 10000 })

  // ID로 고정 — 이름 수정 중에는 행 텍스트가 <input>으로 바뀌어 이름으로 다시 찾을 수 없음.
  const tabAId = await tabRow(mgr, TAB_A).getAttribute('data-tab-id')
  const tabAScoped = mgr.locator(`[data-tab-id="${tabAId}"]`)

  // 2) 탭 이름 수정
  await tabAScoped.getByRole('button', { name: '이름 수정' }).click()
  await tabAScoped.locator('input').fill(TAB_A + '-renamed')
  await tabAScoped.getByRole('button', { name: '저장' }).click()
  const TAB_A_FINAL = TAB_A + '-renamed'
  await tabAScoped.getByText(TAB_A_FINAL).waitFor({ timeout: 10000 })
  ok('STEP2 탭 이름 수정 반영', (await tabAScoped.getByText(TAB_A_FINAL).count()) === 1)

  // 3) 탭 순서 변경(↓) — 탭 5개 전체 sort_order를 순차 UPDATE하므로(reorderResourceTabs) 반영까지 시간이 걸릴 수 있어 폴링으로 기다린다.
  await tabAScoped.getByRole('button', { name: /아래로 이동/ }).click()
  const namesOf = async () => (await mgr.locator('[data-tab-id]').allInnerTexts()).map(t => t.split('·')[0].trim())
  let orderNames = await namesOf()
  const deadline = Date.now() + 15000
  while (orderNames.indexOf(TAB_A_FINAL) <= orderNames.indexOf(TAB_B) && Date.now() < deadline) {
    await page.waitForTimeout(400)
    orderNames = await namesOf()
  }
  ok('STEP3 탭 순서 변경(↓) 반영 — 이 탭이 한 칸 아래로 이동', orderNames.indexOf(TAB_A_FINAL) === orderNames.indexOf(TAB_B) + 1, orderNames)
  await mgr.getByLabel('닫기').click()
  await mgr.waitFor({ state: 'hidden', timeout: 10000 })

  // 4) 글 작성
  await page.getByRole('tab', { name: TAB_A_FINAL }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '+ 글 작성' }).click()
  const editor = page.getByRole('dialog', { name: '글 작성' })
  await editor.waitFor({ timeout: 10000 })
  await editor.locator('#art-tab').selectOption({ label: TAB_A_FINAL })
  await editor.locator('#art-title').fill(ARTICLE_TITLE)
  await editor.locator('#art-summary').fill('QA용 안내문입니다.')
  await editor.locator('#art-audience').fill('QA 담당자')
  await editor.locator('#art-timing').fill('QA 시')
  await editor.locator('#art-steps').fill('첫 번째 확인\n두 번째 확인')
  await editor.locator('#art-notice').fill('QA 참고사항')
  await editor.getByRole('button', { name: '작성 완료' }).click()
  await editor.waitFor({ state: 'hidden', timeout: 15000 })
  await page.getByRole('region', { name: ARTICLE_TITLE }).waitFor({ timeout: 10000 })
  ok('STEP5 저장 후 일반 화면에 글이 바로 보임', (await page.getByRole('region', { name: ARTICLE_TITLE }).count()) === 1)
  const articleCard = page.getByRole('region', { name: ARTICLE_TITLE })
  ok('STEP5 누가/언제/steps/notice가 작성한 대로 보임', (await articleCard.getByText('QA 담당자').count()) === 1 && (await articleCard.getByText('QA 시').count()) === 1 && (await articleCard.locator('li').count()) === 2 && (await articleCard.getByText('QA 참고사항').count()) === 1)
  await shot(page, 'lib-02-article-created')

  // 6) 글 수정
  await articleCard.getByRole('button', { name: '수정' }).click()
  const editor2 = page.getByRole('dialog', { name: '글 수정' })
  await editor2.waitFor({ timeout: 10000 })
  await editor2.locator('#art-summary').fill('QA용 안내문(수정됨).')
  await editor2.getByRole('button', { name: '저장' }).click()
  await editor2.waitFor({ state: 'hidden', timeout: 15000 })
  await page.getByText('QA용 안내문(수정됨).').waitFor({ timeout: 10000 })
  ok('STEP6 글 수정 반영', (await page.getByText('QA용 안내문(수정됨).').count()) === 1)

  // 7) 글을 다른 탭으로 이동
  await page.getByRole('region', { name: ARTICLE_TITLE }).getByRole('button', { name: '수정' }).click()
  const editor3 = page.getByRole('dialog', { name: '글 수정' })
  await editor3.waitFor({ timeout: 10000 })
  await editor3.locator('#art-tab').selectOption({ label: TAB_B })
  await editor3.getByRole('button', { name: '저장' }).click()
  await editor3.waitFor({ state: 'hidden', timeout: 15000 })
  await page.waitForTimeout(400)
  ok('STEP7 이동 후 원래 탭에서는 사라짐', (await page.getByRole('region', { name: ARTICLE_TITLE }).count()) === 0)
  await page.getByRole('tab', { name: TAB_B }).click()
  await page.getByRole('region', { name: ARTICLE_TITLE }).waitFor({ timeout: 10000 })
  ok('STEP7 이동한 탭에 나타남(첨부파일은 article_id를 따라가므로 Storage 이동 불필요)', (await page.getByRole('region', { name: ARTICLE_TITLE }).count()) === 1)

  // 8) 첨부파일 2개 업로드
  const card = page.getByRole('region', { name: ARTICLE_TITLE })
  await card.getByRole('button', { name: '+ 파일 추가' }).click()
  let addModal = page.getByRole('dialog', { name: '파일 추가' })
  await addModal.waitFor({ timeout: 10000 })
  await addModal.locator('#article-file-input').setInputFiles(FILE1)
  await addModal.locator('#article-file-title').fill('QA 첨부파일 1')
  await addModal.getByRole('button', { name: '추가' }).click()
  await addModal.waitFor({ state: 'hidden', timeout: 15000 })
  await fileRow(card, 'QA 첨부파일 1').waitFor({ timeout: 10000 })

  await card.getByRole('button', { name: '+ 파일 추가' }).click()
  addModal = page.getByRole('dialog', { name: '파일 추가' })
  await addModal.waitFor({ timeout: 10000 })
  await addModal.locator('#article-file-input').setInputFiles(FILE2)
  await addModal.locator('#article-file-title').fill('QA 첨부파일 2')
  await addModal.getByRole('button', { name: '추가' }).click()
  await addModal.waitFor({ state: 'hidden', timeout: 15000 })
  await fileRow(card, 'QA 첨부파일 2').waitFor({ timeout: 10000 })
  ok('STEP8 첨부파일 2개 업로드됨(즉시 노출)', (await fileRow(card, 'QA 첨부파일 1').count()) === 1 && (await fileRow(card, 'QA 첨부파일 2').count()) === 1)
  await shot(page, 'lib-03-files-uploaded')

  // 9) 두 파일 모두 열기(링크 존재 + 200)
  const href1 = await fileRow(card, 'QA 첨부파일 1').locator('a').getAttribute('href')
  const href2 = await fileRow(card, 'QA 첨부파일 2').locator('a').getAttribute('href')
  const [r1, r2] = await Promise.all([fetch(href1), fetch(href2)])
  ok('STEP9 두 첨부파일 모두 실제로 열림(200)', r1.status === 200 && r2.status === 200, { s1: r1.status, s2: r2.status })

  // 10) 파일 교체 — 단순화된 CMS는 관리자 수정/새버전 UI를 의도적으로 감췄으므로(Phase 29) 교체는 삭제 후 재업로드로 확인
  note('STEP10 단순화된 자료실 파일 CMS는 새버전/수정 UI를 의도적으로 감췄음(Phase 29) — 교체는 삭제 후 재업로드로 확인', {})
  await fileRow(card, 'QA 첨부파일 2').getByRole('button', { name: '삭제' }).click()
  await page.waitForTimeout(600)
  await card.getByRole('button', { name: '+ 파일 추가' }).click()
  addModal = page.getByRole('dialog', { name: '파일 추가' })
  await addModal.waitFor({ timeout: 10000 })
  await addModal.locator('#article-file-input').setInputFiles(FILE3)
  await addModal.locator('#article-file-title').fill('QA 첨부파일 2(교체)')
  await addModal.getByRole('button', { name: '추가' }).click()
  await addModal.waitFor({ state: 'hidden', timeout: 15000 })
  await fileRow(card, 'QA 첨부파일 2(교체)').waitFor({ timeout: 10000 })
  ok('STEP10 "파일 2" 삭제 후 새 파일로 교체됨', (await fileRow(card, 'QA 첨부파일 2(교체)').count()) === 1 && (await card.getByText('QA 첨부파일 2', { exact: true }).count()) === 0)

  // 11) 파일 삭제(1개)
  await fileRow(card, 'QA 첨부파일 1').getByRole('button', { name: '삭제' }).click()
  await page.waitForTimeout(600)
  ok('STEP11 파일 삭제 반영', (await fileRow(card, 'QA 첨부파일 1').count()) === 0)

  // 12) 첨부파일이 남은 상태에서 글 삭제 시도 → 차단
  await page.getByRole('region', { name: ARTICLE_TITLE }).getByRole('button', { name: '삭제', exact: true }).click()
  await page.waitForTimeout(600)
  ok('STEP12 첨부파일이 있는 글은 삭제가 차단됨(글이 그대로 남아있음)', (await page.getByRole('region', { name: ARTICLE_TITLE }).count()) === 1)
  await shot(page, 'lib-04-delete-blocked')

  // 13) 남은 파일 삭제 후 글 삭제
  await fileRow(card, 'QA 첨부파일 2(교체)').getByRole('button', { name: '삭제' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('region', { name: ARTICLE_TITLE }).getByRole('button', { name: '삭제', exact: true }).click()
  await page.waitForTimeout(600)
  ok('STEP13 첨부파일을 모두 지운 뒤에는 글 삭제 성공', (await page.getByRole('region', { name: ARTICLE_TITLE }).count()) === 0)

  // 14) 빈 QA 탭 삭제
  await page.getByRole('button', { name: '탭 관리' }).click()
  const mgr2 = page.getByRole('dialog', { name: '탭 관리' })
  await mgr2.waitFor({ timeout: 10000 })
  for (const name of [TAB_A_FINAL, TAB_B]) {
    await tabRow(mgr2, name).getByRole('button', { name: '삭제' }).click()
    await tabRow(mgr2, name).waitFor({ state: 'detached', timeout: 10000 })
  }
  ok('STEP14 빈 QA 탭 2개 모두 삭제됨', (await tabRow(mgr2, TAB_A_FINAL).count()) === 0 && (await tabRow(mgr2, TAB_B).count()) === 0)
  await mgr2.getByLabel('닫기').click()

  ok('production 접속 없음(이번 세션)', rec.prod.length === 0, rec.prod)
  ok('콘솔 오류 없음', rec.errors.length === 0, rec.errors.slice(0, 3))
  await ctx.close()
}

// ── 글 순서 변경(article reorder) — 이전 Phase 최종보고에서 "검증 누락"으로 명시됐던 항목.
//    탭 순서와 같은 UI(↑/↓)지만 대상이 글(resource_articles.sort_order)이고, 같은 탭 안에서만 동작한다.
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await adminLogin(page)
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })

  const TAB_R = 'QA-LIB-reorder-' + Date.now()
  const ART_A = 'QA Reorder Article A ' + Date.now()
  const ART_B = 'QA Reorder Article B ' + Date.now()

  await page.getByRole('button', { name: '탭 관리' }).click()
  const mgrR = page.getByRole('dialog', { name: '탭 관리' })
  await mgrR.waitFor({ timeout: 10000 })
  await mgrR.getByLabel('새 탭 이름').fill(TAB_R)
  await mgrR.getByRole('button', { name: '+ 탭 생성' }).click()
  await tabRow(mgrR, TAB_R).waitFor({ timeout: 10000 })
  await mgrR.getByLabel('닫기').click()
  await mgrR.waitFor({ state: 'hidden', timeout: 10000 })

  await page.getByRole('tab', { name: TAB_R }).click()
  await page.waitForTimeout(400)

  const writeArticle = async (title) => {
    await page.getByRole('button', { name: '+ 글 작성' }).click()
    const ed = page.getByRole('dialog', { name: '글 작성' })
    await ed.waitFor({ timeout: 10000 })
    await ed.locator('#art-tab').selectOption({ label: TAB_R })
    await ed.locator('#art-title').fill(title)
    await ed.getByRole('button', { name: '작성 완료' }).click()
    await ed.waitFor({ state: 'hidden', timeout: 15000 })
    await page.getByRole('region', { name: title }).waitFor({ timeout: 10000 })
  }
  await writeArticle(ART_A)
  await writeArticle(ART_B)

  const orderOfTitles = async () => (await page.locator('section[aria-labelledby^="article-"] h2').allInnerTexts())
  let order0 = await orderOfTitles()
  ok('STEP-M 새 탭에 글 2개를 순서대로 작성 → A,B 순서', order0.indexOf(ART_A) === 0 && order0.indexOf(ART_B) === 1, order0)

  // ↑/↓ 버튼은 canManage(관리자)일 때만, 그리고 "전체" 탭이 아니라 실제 탭이 선택돼 있을 때만 보임.
  const cardB = page.getByRole('region', { name: ART_B })
  await cardB.getByRole('button', { name: '위로 이동' }).click()
  const deadline = Date.now() + 15000
  let order1 = await orderOfTitles()
  while (order1.indexOf(ART_B) !== 0 && Date.now() < deadline) { await page.waitForTimeout(400); order1 = await orderOfTitles() }
  ok('STEP-M B에서 "위로 이동" 클릭 → 화면 순서가 B,A로 바뀜', order1.indexOf(ART_B) === 0 && order1.indexOf(ART_A) === 1, order1)
  await shot(page, 'lib-05-article-reordered')

  // 하드 새로고침 후에도 순서가 유지되는지(= DB sort_order에 실제로 반영됐다는 증거)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Page.reload', { ignoreCache: true })
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.getByRole('tab', { name: TAB_R }).click()
  await page.waitForTimeout(500)
  const order2 = await orderOfTitles()
  ok('STEP-M 하드 새로고침 후에도 B,A 순서가 그대로 유지됨(=서버에 저장된 순서, 화면 state 아님)', order2.indexOf(ART_B) === 0 && order2.indexOf(ART_A) === 1, order2)

  // DB sort_order를 읽기전용 REST 조회로 직접 확인(化면과 독립적인 증거).
  const env = {}
  for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
  const restUrl = `${env.VITE_SUPABASE_URL}/rest/v1/resource_articles?select=title,sort_order&title=in.("${ART_A}","${ART_B}")&order=sort_order.asc`
  const restRes = await page.request.get(restUrl, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } })
  const rows = await restRes.json()
  ok('STEP-M DB 직접 조회(읽기전용): resource_articles.sort_order 기준으로도 B가 A보다 앞섬', restRes.ok() && rows.length === 2 && rows[0].title === ART_B && rows[1].title === ART_A, rows)

  // 원래 순서(A,B)로 되돌리고 QA 탭/글 정리
  const cardBAgain = page.getByRole('region', { name: ART_B })
  await cardBAgain.getByRole('button', { name: '아래로 이동' }).click()
  let order3 = await orderOfTitles()
  const deadline2 = Date.now() + 15000
  while (order3.indexOf(ART_A) !== 0 && Date.now() < deadline2) { await page.waitForTimeout(400); order3 = await orderOfTitles() }
  ok('STEP-M 정리: "아래로 이동"으로 원래 순서(A,B)로 복원', order3.indexOf(ART_A) === 0 && order3.indexOf(ART_B) === 1, order3)

  for (const title of [ART_A, ART_B]) {
    await page.getByRole('region', { name: title }).getByRole('button', { name: '삭제', exact: true }).click()
    await page.waitForTimeout(500)
  }
  await page.getByRole('button', { name: '탭 관리' }).click()
  const mgrR2 = page.getByRole('dialog', { name: '탭 관리' })
  await mgrR2.waitFor({ timeout: 10000 })
  await tabRow(mgrR2, TAB_R).getByRole('button', { name: '삭제' }).click()
  await tabRow(mgrR2, TAB_R).waitFor({ state: 'detached', timeout: 10000 })
  ok('STEP-M QA 글 2개 + QA 탭 정리 완료', (await tabRow(mgrR2, TAB_R).count()) === 0)
  await mgrR2.getByLabel('닫기').click()

  ok('STEP-M production 접속 없음', rec.prod.length === 0)
  ok('STEP-M 콘솔 오류 없음', rec.errors.length === 0, rec.errors.slice(0, 3))
  await ctx.close()
}

await browser.close()
summary()
