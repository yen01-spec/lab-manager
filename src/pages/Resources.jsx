import { useEffect, useState, lazy, Suspense } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { C, PageBanner, btnPrimary } from '../design'
import PillNav from '../components/PillNav'
import ResourceGuidePage from '../components/resources/ResourceGuidePage'
import ResourceReagentList from '../components/resources/ResourceReagentList'
import { lotLabel } from '../lib/lotNo'
import { RESOURCE_CATEGORIES, RESOURCE_GUIDES } from '../lib/resourceGuides'
import { getSetting, SCHOOL_SAFETY_SYSTEM_FALLBACK, KOSHA_LABEL_FALLBACK } from '../lib/appSettings'
import { getSpecialManagementInfo } from '../lib/specialManagementSubstances'
import { getHazardCategory } from '../lib/hazardCategory'

// 자료 첫 진입을 가볍게 — 무거운 도구는 해당 섹션을 열 때만 로드
const SchoolRegistrationView = lazy(() => import('../components/signage/SchoolRegistrationView'))

// 현재 시약이 특별관리물질인지: CAS 매칭 확정=true, CAS는 맞지만 이름/조건 불명확='check'
const specialFilter = (r) => {
  const info = getSpecialManagementInfo(r.name, r.cas_no)
  return info?.status === 'confirmed' ? true : info?.status === 'suspected' ? 'check' : false
}
// 사전유해인자 작성 준비 — 라이트 데이터(hazard, hazard_classifications) 기준
const HAZARD_LIGHT_COLS = 'hazard, hazard_classifications'
const isHazardous = (r) => !!(r.hazard && String(r.hazard).trim()) || (r.hazard_classifications || []).length > 0
const isFireLaw = (r) => !!getHazardCategory(r.hazard_classifications).fireSafetyClass
const PRIOR_PRESETS = [
  { key: 'all', label: '전체', fn: () => true },
  { key: 'hazard', label: '유해·위험 시약', fn: isHazardous },
  { key: 'special', label: '특별관리물질', fn: specialFilter },
  { key: 'firelaw', label: '위험물', fn: isFireLaw },
]

// 작성 참고용 Excel (학교 공식 업로드 양식 아님)
async function exportReferenceExcel(reagents, filenameBase) {
  const XLSX = await import('xlsx')
  const header = ['국문명', '영문명', 'CAS No.', '제조사', '규격', '현재 잔량(%)', '미개봉(병)', '입고일', '보관 위치', 'Lot / 내부관리번호']
  const rows = []
  for (const r of reagents) {
    const lots = r._lots || []
    if (lots.length === 0) rows.push([r.name_ko || '', r.name || '', r.cas_no || '', r.company || '', r.volume ? `${r.volume}${r.unit || ''}` : '', '', '', '', '', ''])
    for (const l of lots) rows.push([
      r.name_ko || '', r.name || '', r.cas_no || '', r.company || '', r.volume ? `${r.volume}${r.unit || ''}` : '',
      l.current_stock ?? '', l.sealed_count ?? '', l.received_date || '', l._locText || '', lotLabel(l),
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet([['※ 작성 참고용 — 학교 공식 업로드 양식이 아닙니다'], [], header, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '작성참고')
  XLSX.writeFile(wb, `${filenameBase}_작성참고_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const EMBEDS = {
  schoolRegistration: <SchoolRegistrationView />,
  specialTargets: (
    <ResourceReagentList filterFn={specialFilter} dedupeByCas title="현재 연구실 특별관리물질"
      fields={['casNo', 'lotCount', 'volume']} lotFields={['currentStock', 'location']} />
  ),
  specialRegister: (
    <ResourceReagentList filterFn={specialFilter} dedupeByCas selectable title="현재 연구실 특별관리물질"
      fields={['nameKo', 'casNo', 'company', 'volume']}
      lotFields={['lot', 'currentStock', 'sealedCount', 'receivedDate', 'location']}
      onExport={list => exportReferenceExcel(list, '특별관리물질_등록정보')} exportLabel="등록 정보 목록 내보내기" />
  ),
  specialLogInfo: (
    <ResourceReagentList filterFn={specialFilter} dedupeByCas selectable title="현재 연구실 특별관리물질"
      fields={['nameKo', 'casNo']}
      lotFields={['lot', 'currentStock', 'sealedCount', 'receivedDate', 'location']}
      onExport={list => exportReferenceExcel(list, '특별관리물질_취급일지정보')} exportLabel="취급일지 작성용 정보 내보내기" />
  ),
  wasteReagent: (
    <ResourceReagentList requireActiveLots selectable
      fields={['nameKo', 'casNo', 'company', 'volume']}
      lotFields={['lot', 'currentStock', 'sealedCount', 'receivedDate', 'location']}
      onExport={list => exportReferenceExcel(list, '폐시약')} exportLabel="폐시약 작성 참고용 Excel"
      emptyText="검색 결과가 없거나 보유 중인 Lot이 없습니다." />
  ),
  priorPrepare: (
    <ResourceReagentList filterPresets={PRIOR_PRESETS} lightColumns={HAZARD_LIGHT_COLS} selectable
      fields={['nameKo', 'casNo', 'volume', 'hazard']}
      lotFields={['lot', 'currentStock', 'location']}
      onExport={list => exportReferenceExcel(list, '사전유해인자')} exportLabel="작성 참고용 Excel 내보내기" />
  ),
}

// 자료 탭 — 강원대학교 공식 연구실안전관리 업무 지원 허브 (수정방안 §5~10).
export default function Resources() {
  const { isAdmin } = useOutletContext?.() || {}
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [schoolUrl, setSchoolUrl] = useState('')
  const [koshaUrl, setKoshaUrl] = useState('')

  const cat = RESOURCE_CATEGORIES.some(c => c.key === params.get('c')) ? params.get('c') : 'notice'
  const guide = RESOURCE_GUIDES[cat]
  const sectionKey = guide?.sections.some(s => s.key === params.get('s')) ? params.get('s') : guide?.sections[0]?.key
  const section = guide?.sections.find(s => s.key === sectionKey)

  useEffect(() => {
    getSetting('school_safety_system_url', SCHOOL_SAFETY_SYSTEM_FALLBACK).then(setSchoolUrl)
    getSetting('kosha_label_url', KOSHA_LABEL_FALLBACK).then(setKoshaUrl)
  }, [])

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
              section={section} schoolUrl={schoolUrl} koshaUrl={koshaUrl} isAdmin={isAdmin} onAction={handleAction}
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
