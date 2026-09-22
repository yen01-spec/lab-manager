// STAGING 전용 — QA-LIB- 접두사 테스트 탭/글/파일 잔여물 정리(임의 배정 없이 이름 접두사로만 매칭)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
const s = createClient(env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: tabs } = await s.from('resource_tabs').select('id, name').like('name', 'QA-LIB-%')
console.log('found tabs:', tabs)
for (const t of tabs || []) {
  const { data: arts } = await s.from('resource_articles').select('id').eq('tab_id', t.id)
  for (const a of arts || []) {
    await s.from('resource_files').delete().eq('article_id', a.id)
    await s.from('resource_articles').delete().eq('id', a.id)
  }
  await s.from('resource_tabs').delete().eq('id', t.id)
}
const { data: leftoverArticles } = await s.from('resource_articles').select('id, title').eq('title', 'QA 자료실 글')
console.log('leftover QA articles:', leftoverArticles)
for (const a of leftoverArticles || []) {
  await s.from('resource_files').delete().eq('article_id', a.id)
  await s.from('resource_articles').delete().eq('id', a.id)
}
console.log('cleanup done')
