import { useEffect, useState, lazy, Suspense } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { C, PageBanner, btnPrimary } from '../design'
import PillNav from '../components/PillNav'
import ResourceGuidePage from '../components/resources/ResourceGuidePage'
import { RESOURCE_CATEGORIES, RESOURCE_GUIDES } from '../lib/resourceGuides'
import { getSetting, SCHOOL_SAFETY_SYSTEM_FALLBACK } from '../lib/appSettings'

// 자료 첫 진입을 가볍게 — 실제 업무지원 도구는 해당 섹션을 열 때만 로드
const SchoolRegistrationView = lazy(() => import('../components/signage/SchoolRegistrationView'))
const EMBEDS = {
  schoolRegistration: <SchoolRegistrationView />,
}

// 자료 탭 — 강원대학교 공식 연구실안전관리 업무 지원 허브 (수정방안 §5~10).
export default function Resources() {
  const { isAdmin } = useOutletContext?.() || {}
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [schoolUrl, setSchoolUrl] = useState('')

  const cat = RESOURCE_CATEGORIES.some(c => c.key === params.get('c')) ? params.get('c') : 'notice'
  const guide = RESOURCE_GUIDES[cat]
  const sectionKey = guide?.sections.some(s => s.key === params.get('s')) ? params.get('s') : guide?.sections[0]?.key
  const section = guide?.sections.find(s => s.key === sectionKey)

  useEffect(() => { getSetting('school_safety_system_url', SCHOOL_SAFETY_SYSTEM_FALLBACK).then(setSchoolUrl) }, [])

  const setCat = (c) => setParams(c === 'notice' ? { c } : { c, s: RESOURCE_GUIDES[c].sections[0].key })
  const setSection = (s) => setParams({ c: cat, s })

  function handleAction(a) {
    // 이후 sub-phase에서 실제 시약 데이터/기능에 연결. 지금은 안내만.
    alert('이 기능은 다음 단계에서 연결됩니다: ' + a.label)
  }

  return (
    <div>
      <PageBanner title="자료" sub="Resources" breadcrumb={['자료']} />
      <div style={{ padding: '20px 24px 48px', maxWidth: 960, margin: '0 auto' }}>

        {/* 1차 탭 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${C.border}`, overflowX: 'auto', overflowY: 'hidden' }}>
          {RESOURCE_CATEGORIES.map(c => {
            const active = c.key === cat
            return (
              <button key={c.key} onClick={() => setCat(c.key)} style={{
                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13.5, fontFamily: 'inherit', fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                color: active ? C.blueDark : C.muted,
                borderBottom: active ? `2px solid ${C.blue}` : '2px solid transparent', marginBottom: -1,
              }}>{c.label}</button>
            )
          })}
        </div>

        {cat === 'notice' ? (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 24px', boxShadow: '0 1px 3px rgba(16,24,40,.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 6 }}>연구실 공지사항 게시판</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 18 }}>공지·안내글과 첨부파일을 확인합니다.</div>
            <button onClick={() => navigate('/notices')} style={{ ...btnPrimary, padding: '9px 20px' }}>공지사항 게시판 열기 →</button>
          </div>
        ) : (
          <>
            <PillNav
              items={guide.sections.map(s => ({ key: s.key, label: s.label }))}
              value={sectionKey}
              onChange={setSection}
              style={{ marginBottom: 18 }}
            />
            <ResourceGuidePage
              section={section} schoolUrl={schoolUrl} isAdmin={isAdmin} onAction={handleAction}
              embedNode={section?.embed && (
                <Suspense fallback={<div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>불러오는 중...</div>}>
                  {EMBEDS[section.embed]}
                </Suspense>
              )}
            />
          </>
        )}
      </div>
    </div>
  )
}
