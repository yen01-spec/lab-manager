import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { C, PageBanner } from '../design'
import { supabase } from '../supabase'
import { fetchAllPages } from '../lib/fetchAllPages'
import EntranceSignageView from '../components/signage/EntranceSignageView'
import HazardLedgerView from '../components/signage/HazardLedgerView'

// 표지·대장 준비 도구 — [자료] 탭의 안전관리 준비를 돕는 보조 화면.
// 학교등록 엑셀 생성은 [자료 → 연구실 운영 → 화학물질 등록]으로, 특별관리물질 취급일지 정보는
// [자료 → 특별관리물질 → 취급일지]로, 안전관리규정 자료실은 [자료]의 공식 자료 CMS로 이관됨.
// 여기에는 시약 DB를 그 자리에서 집계해야 하는 도구(출입구 표지 현황 / 유해인자 취급·관리대장)만 남긴다.
const TABS = [
  ['entrance', '출입구 표지 현황'],
  ['ledger', '유해인자 취급·관리대장'],
]

export default function SafetySignage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'entrance'
  const setTab = (t) => setParams(t === 'entrance' ? {} : { tab: t })
  const [reagents, setReagents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllPages((from, to) => supabase.from('reagents')
      .select('id, name, cas_no, ghs_pictograms')
      .neq('status', 'archived').range(from, to))
      .then(data => { setReagents(data); setLoading(false) })
  }, [])

  return (
    <div>
      <PageBanner title="표지·대장 준비 도구" sub="Signage & Ledger Tools" breadcrumb={['홈', '자료', '표지·대장 준비 도구']} />
      <div style={{ padding: '8px 16px 40px' }}>
        <div style={{
          margin: '8px 0 16px', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 8, fontSize: 12.5, color: C.textSub, lineHeight: 1.6,
        }}>
          현재 등록된 시약 데이터를 그 자리에서 집계해 <b>출입구 표지 현황</b>과 <b>유해인자 취급·관리대장(Excel)</b>을
          만들어 주는 준비 도구입니다. 공식 등록·관리는 강원대학교 연구실안전관리시스템에서 진행합니다.
        </div>
        <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: `1px solid ${C.border}`, overflowX: 'auto', overflowY: 'hidden' }}>
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
        ) : (
          <HazardLedgerView />
        )}
      </div>
    </div>
  )
}
