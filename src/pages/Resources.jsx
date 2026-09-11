import { useEffect, useState, lazy, Suspense } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { C, PageBanner, btnPrimary } from '../design'
import { supabase } from '../supabase'
import PillNav from '../components/PillNav'
import ResourceGuidePage from '../components/resources/ResourceGuidePage'
import ResourceReagentList from '../components/resources/ResourceReagentList'
import { RESOURCE_CATEGORIES, RESOURCE_GUIDES } from '../lib/resourceGuides'
import { SCHOOL_SAFETY_SYSTEM_FALLBACK, KOSHA_LABEL_FALLBACK } from '../lib/appSettings'
import { getSpecialManagementInfo } from '../lib/specialManagementSubstances'

// 자료 첫 진입을 가볍게 — 무거운 도구는 해당 섹션을 열 때만 로드
const SchoolRegistrationView = lazy(() => import('../components/signage/SchoolRegistrationView'))

// 현재 시약이 특별관리물질인지: CAS 매칭 확정=true, CAS는 맞지만 이름/조건 불명확='check'
const specialFilter = (r) => {
  const info = getSpecialManagementInfo(r.name, r.cas_no)
  return info?.status === 'confirmed' ? true : info?.status === 'suspected' ? 'check' : false
}

// Phase P2: 검색/필터/선택/일반 Excel 내보내기는 시약목록(ReagentList)이 단일 중심이다.
// 자료 탭엔 그 기능을 반복하는 임베드를 두지 않고, "시약목록에서 보기(preset 딥링크)" 액션
// 버튼으로 연결한다(resourceGuides.js의 reagent-search 액션 + preset). specialTargets(현재
// 보유 특별관리물질 "N종" 요약, 선택/Excel 없음)만 남긴다 — 요약 정보는 유지 가능.
const EMBEDS = {
  schoolRegistration: <SchoolRegistrationView />,
  specialTargets: (
    <ResourceReagentList filterFn={specialFilter} dedupeByCas title="현재 연구실 특별관리물질"
      note="CAS 기준으로 중복 제거한 물질 종류 수입니다. 시약목록에서는 제조사·제품별로 여러 행으로 표시될 수 있습니다."
      fields={['casNo', 'lotCount', 'volume']} lotFields={['currentStock', 'location']} />
  ),
}

// 자료 탭 — 강원대학교 공식 연구실안전관리 업무 지원 허브 (수정방안 §5~10).
export default function Resources() {
  const { isAdmin } = useOutletContext?.() || {}
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [settings, setSettings] = useState({})   // { school_safety_system_url, kosha_label_url, lab_name, lab_professor, ... }

  const cat = RESOURCE_CATEGORIES.some(c => c.key === params.get('c')) ? params.get('c') : 'notice'
  const guide = RESOURCE_GUIDES[cat]
  const sectionKey = guide?.sections.some(s => s.key === params.get('s')) ? params.get('s') : guide?.sections[0]?.key
  const section = guide?.sections.find(s => s.key === sectionKey)

  useEffect(() => {
    supabase.from('app_settings').select('key, value')
      .in('key', ['school_safety_system_url', 'kosha_label_url', 'lab_name', 'lab_professor', 'lab_assistant', 'lab_phone', 'safety_dept_phone', 'emergency_contact'])
      .then(({ data }) => {
        const m = {}; (data || []).forEach(r => { m[r.key] = r.value })
        m.school_safety_system_url ||= SCHOOL_SAFETY_SYSTEM_FALLBACK
        m.kosha_label_url ||= KOSHA_LABEL_FALLBACK
        setSettings(m)
      })
  }, [])

  const setCat = (c) => setParams(c === 'notice' ? { c } : { c, s: RESOURCE_GUIDES[c].sections[0].key })
  const setSection = (s) => setParams({ c: cat, s })

  function handleAction(a) {
    if (a.type === 'goto') {
      const target = RESOURCE_GUIDES[a.c || cat]?.sections.some(s => s.key === a.s) ? a.s : sectionKey
      setParams({ c: a.c || cat, s: target })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (a.type === 'reagent-search') {
      // preset: 시약목록의 실제 필터(specialOnly/hazardClassFilter/fireClassFilter)를 그대로
      // 초기값으로 채우는 딥링크 — 여기서 새 판정 기준을 만들지 않는다(ReagentList.jsx 참고).
      const qs = new URLSearchParams()
      if (a.q) qs.set('q', a.q)
      if (a.preset) qs.set('preset', a.preset)
      const query = qs.toString()
      navigate(query ? `/reagents/list?${query}` : '/reagents/list')
      return
    }
    if (a.type === 'route' && a.to) {
      navigate(a.to)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (a.type === 'contact') {
      // 명백한 placeholder 값(OOO / 000-0000-0000 / 미정 / 없음 / - 등)은 실제 연락처로 취급하지 않음
      const real = (v) => {
        const s = (v || '').toString().trim()
        if (!s) return null
        if (/^[-·.\s]*$/.test(s)) return null
        if (/^(미정|없음|추후|tbd|n\/?a)$/i.test(s)) return null
        if (/^[oO0]{2,}$/.test(s.replace(/[\s()-]/g, ''))) return null       // OOO, 000
        if (/^0[01]0[-\s]?0{3,4}[-\s]?0{3,4}$/.test(s)) return null          // 000-0000-0000, 010-0000-0000
        return s
      }
      const parts = [
        real(settings.emergency_contact) && `비상연락: ${real(settings.emergency_contact)}`,
        real(settings.lab_professor) && `연구실책임자: ${real(settings.lab_professor)}`,
        real(settings.lab_assistant) && `안전관리담당자: ${real(settings.lab_assistant)}`,
        real(settings.lab_phone) && `연구실 전화: ${real(settings.lab_phone)}`,
        real(settings.safety_dept_phone) && `교내 안전관리 부서: ${real(settings.safety_dept_phone)}`,
      ].filter(Boolean)
      alert(parts.length
        ? '📞 비상연락처\n\n' + parts.join('\n') + '\n\n※ 위급 시 119'
        : '등록된 비상연락처가 없습니다. 연구실책임자·안전관리담당자 연락처를 확인해 대응하세요. (위급 시 119)')
      return
    }
    alert('관련 자료 영역에서 확인해주세요.')
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
              section={section} categoryKey={cat} sectionKey={sectionKey} settings={settings} isAdmin={isAdmin} onAction={handleAction}
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
