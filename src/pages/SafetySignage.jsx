import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { C, PageBanner } from '../design'
import { supabase } from '../supabase'
import { fetchAllPages } from '../lib/fetchAllPages'
import EntranceSignageView from '../components/signage/EntranceSignageView'
import LabelBuilderView from '../components/signage/LabelBuilderView'
import SchoolRegistrationView from '../components/signage/SchoolRegistrationView'
import SpecialMaterialLogView from '../components/signage/SpecialMaterialLogView'
import HazardLedgerView from '../components/signage/HazardLedgerView'
import RegulationDocumentsView from '../components/signage/RegulationDocumentsView'

// 안전표지 관리 — 강원대 연구실 안전점검 지적사항(안전보건표지 미부착·경고표지 미부착/오류·
// 사전유해인자위험분석 보고서 미작성·특별관리물질 취급일지 미작성) 대응.
// 화면 A(출입구 표지 현황)/B(용기 라벨 생성)/C(학교등록 엑셀 생성)/D(특별관리물질 취급일지)
// 를 탭으로 전환.
export default function SafetySignage() {
  const { student, isAdmin } = useOutletContext?.() || {}
  const [tab, setTab] = useState('entrance')
  const [reagents, setReagents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllPages((from, to) => supabase.from('reagents')
      .select('id, name, cas_no, ghs_pictograms')
      .neq('status', 'archived').range(from, to))
      .then(data => { setReagents(data); setLoading(false) })
  }, [])

  const TABS = [
    ['entrance', '출입구 표지 현황'],
    ['label', '용기 라벨 생성'],
    ['school', '학교등록 엑셀 생성'],
    ['log', '특별관리물질 취급일지'],
    ['ledger', '유해인자 취급관리대장'],
    ['docs', '안전관리규정 자료실'],
  ]

  return (
    <div>
      <PageBanner title="안전표지 관리" sub="Safety Signage" breadcrumb={['홈', '안전관리', '안전표지 관리']} />
      <div style={{ padding: '8px 16px 40px' }}>
        <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              fontSize: '14px', fontWeight: tab === key ? '700' : '500', color: tab === key ? C.navy : C.muted,
              background: 'none', border: 'none', padding: '10px 4px', marginRight: '26px', cursor: 'pointer',
              borderBottom: tab === key ? `3px solid ${C.danger}` : '3px solid transparent', whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
        ) : tab === 'entrance' ? (
          <EntranceSignageView reagents={reagents} />
        ) : tab === 'label' ? (
          <LabelBuilderView />
        ) : tab === 'school' ? (
          <SchoolRegistrationView />
        ) : tab === 'log' ? (
          <SpecialMaterialLogView student={student} isAdmin={isAdmin} />
        ) : tab === 'ledger' ? (
          <HazardLedgerView />
        ) : (
          <RegulationDocumentsView student={student} />
        )}
      </div>
    </div>
  )
}
