import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { C, PageBanner } from '../design'
import { supabase } from '../supabase'
import ResourceCard from '../components/resources/ResourceCard'
import { ALL_RESOURCE_SECTIONS, RESOURCE_GROUPS } from '../lib/resourceGuides'
import { getAllResources } from '../lib/resources'
import { SCHOOL_SAFETY_SYSTEM_FALLBACK, KOSHA_LABEL_FALLBACK } from '../lib/appSettings'

// 자료 탭 — 짧은 행동지침·규칙 + 첨부파일을 보는 읽기 전용 자료실.
// 시약 데이터 조회/필터/선택/Excel 같은 업무 도구는 여기서 반복하지 않는다(시약 목록이 그 단일 화면).
// 공지사항은 별도 게시판(/notices, Home에 이미 독립 메뉴)이라 여기 카테고리에 넣지 않는다.
export default function Resources() {
  const { isAdmin } = useOutletContext?.() || {}
  const [params, setParams] = useSearchParams()
  const [settings, setSettings] = useState({})
  const [filesState, setFilesState] = useState({ status: 'loading', rows: [] })

  const group = RESOURCE_GROUPS.some(g => g.key === params.get('g')) ? params.get('g') : 'all'

  useEffect(() => {
    supabase.from('app_settings').select('key, value')
      .in('key', ['school_safety_system_url', 'kosha_label_url'])
      .then(({ data }) => {
        const m = {}; (data || []).forEach(r => { m[r.key] = r.value })
        m.school_safety_system_url ||= SCHOOL_SAFETY_SYSTEM_FALLBACK
        m.kosha_label_url ||= KOSHA_LABEL_FALLBACK
        setSettings(m)
      })
  }, [])

  // 자료 항목마다 따로 조회하지 않고 한 번에 가져와서 항목별로 나눠 쓴다(29개 카드가 한 화면에
  // 동시에 보이므로 — ResourceFiles.initialRows 참고).
  useEffect(() => {
    let alive = true
    getAllResources()
      .then(rows => { if (alive) setFilesState({ status: 'ok', rows }) })
      .catch(() => { if (alive) setFilesState({ status: 'error', rows: [] }) })
    return () => { alive = false }
  }, [])

  const filesByKey = useMemo(() => {
    const m = new Map()
    for (const r of filesState.rows) {
      const k = `${r.category_key}|${r.section_key}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return m
  }, [filesState.rows])

  const sections = useMemo(
    () => ALL_RESOURCE_SECTIONS.filter(s => group === 'all' || s.group === group),
    [group],
  )

  return (
    <div>
      <PageBanner title="자료" sub="Resources" breadcrumb={['자료']} />
      <div style={{ padding: '20px 24px 48px', maxWidth: 760, margin: '0 auto' }}>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.muted }}>연구실 업무에 필요한 기본 절차와 서식을 확인합니다.</p>

        <div role="group" aria-label="자료 분류" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {RESOURCE_GROUPS.map(g => {
            const active = g.key === group
            return (
              <button key={g.key} onClick={() => setParams(g.key === 'all' ? {} : { g: g.key })} aria-pressed={active} style={{
                padding: '10px 18px', minHeight: 44, minWidth: 44, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                fontWeight: active ? 700 : 500, border: `1px solid ${active ? C.navy : C.border}`,
                background: active ? C.navy : C.white, color: active ? '#fff' : C.text,
              }}>{g.label}</button>
            )
          })}
        </div>

        {filesState.status === 'loading' ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>불러오는 중...</div>
        ) : (
          sections.map(section => (
            <ResourceCard key={`${section.categoryKey}.${section.key}`} section={section} categoryLabel={section.categoryLabel}
              settings={settings} isAdmin={isAdmin} filesRows={filesByKey.get(`${section.categoryKey}|${section.key}`) || []} />
          ))
        )}
      </div>
    </div>
  )
}
