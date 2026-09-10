import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'
import DashboardTab from '../components/admin/DashboardTab'
import ChangeRequestTab from '../components/admin/ChangeRequestTab'
import DisposalTab from '../components/admin/DisposalTab'
import MoveTab from '../components/admin/MoveTab'
import PurchaseTab from '../components/admin/PurchaseTab'
import ReagentAddTab from '../components/admin/ReagentAddTab'
import BulkAddTab from '../components/admin/BulkAddTab'
import BulkUpdateTab from '../components/admin/BulkUpdateTab'
import NoticeTab from '../components/admin/NoticeTab'
import SpecialMaterialLogTab from '../components/admin/SpecialMaterialLogTab'
import LogTab from '../components/admin/LogTab'
import SettingsTab from '../components/admin/SettingsTab'

// 섹션 헤더가 있는 사이드바 항목. section이 있으면 그 위에 구분 라벨을 그린다.
const TABS = [
  { key: 'dashboard', label: '대시보드', icon: '📊' },
  { key: 'req-change', label: '정보 변경', icon: '📝', section: '요청 처리' },
  { key: 'req-disposal', label: '폐기', icon: '🗑️' },
  { key: 'req-move', label: '위치 이동', icon: '📍' },
  { key: 'purchase', label: '구매 관리', icon: '🛒', section: '구매' },
  { key: 'data-add', label: '시약 1건 추가', icon: '🧪', section: '시약 데이터' },
  { key: 'data-bulk-add', label: 'Excel 일괄 추가', icon: '📥' },
  { key: 'data-bulk', label: '정보 일괄갱신', icon: '🔄' },
  { key: 'notice', label: '공지/안전관리', icon: '📢', section: '콘텐츠' },
  { key: 'special', label: '특별관리물질', icon: '🚨' },
  { key: 'log', label: '작업 기록', icon: '📋', section: '기타' },
  { key: 'settings', label: '설정', icon: '⚙️' },
]

export default function Admin() {
  const { isAdmin, student } = useOutletContext()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')
  const [locations, setLocations] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [disposalCount, setDisposalCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) { alert('관리자만 접근 가능합니다'); navigate('/'); return }
    fetchLocations()
    fetchPendingCount()
    fetchDisposalCount()
  }, [isAdmin])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchPendingCount() {
    const { count } = await supabase
      .from('purchase_requests').select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingCount(count || 0)
  }

  async function fetchDisposalCount() {
    const { count } = await supabase
      .from('disposal_requests').select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setDisposalCount(count || 0)
  }

  return (
    <div>
      <PageBanner title="관리자 메뉴" sub="Admin Panel" breadcrumb={['홈', '관리자']} />
      <div style={{ padding: '28px 40px', display: 'flex', gap: '24px' }}>
        <div style={{
          width: '190px', flexShrink: 0, background: '#fff', borderRadius: '10px',
          border: `1px solid ${C.border}`, padding: '12px 0', height: 'fit-content',
          position: 'sticky', top: '80px', boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
        }}>
          <div style={{ padding: '8px 16px 12px', fontSize: '10px', fontWeight: '700',
            color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>관리자 메뉴</div>
          {TABS.map(t => (
            <div key={t.key}>
              {t.section && (
                <div style={{ padding: '12px 16px 5px', fontSize: '10px', fontWeight: '700',
                  color: '#A7AEBA', letterSpacing: '0.08em' }}>{t.section}</div>
              )}
              <button onClick={() => setTab(t.key)} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '8px 16px', border: 'none',
                background: tab === t.key ? '#EEF2FB' : 'transparent',
                color: tab === t.key ? C.navy : C.text,
                fontWeight: tab === t.key ? '700' : '400',
                fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                borderLeft: tab === t.key ? `3px solid ${C.gold}` : '3px solid transparent',
              }}>
                <span>{t.icon}</span>
                <span style={{ flex: 1 }}>{t.label}</span>
                {t.key === 'purchase' && pendingCount > 0 && (
                  <span style={{ background: C.danger, color: '#fff',
                    fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 6px' }}>{pendingCount}</span>
                )}
                {t.key === 'req-disposal' && disposalCount > 0 && (
                  <span style={{ background: C.danger, color: '#fff',
                    fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 6px' }}>{disposalCount}</span>
                )}
              </button>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === 'dashboard' && <DashboardTab onGoTab={setTab} />}
          {tab === 'req-change' && <ChangeRequestTab student={student} />}
          {tab === 'req-disposal' && <DisposalTab onCountChange={fetchDisposalCount} student={student} />}
          {tab === 'req-move' && <MoveTab locations={locations} />}
          {tab === 'purchase' && <PurchaseTab onCountChange={fetchPendingCount} />}
          {tab === 'data-add' && <ReagentAddTab locations={locations} student={student} />}
          {tab === 'data-bulk-add' && <BulkAddTab locations={locations} student={student} />}
          {tab === 'data-bulk' && <BulkUpdateTab />}
          {tab === 'notice' && <NoticeTab />}
          {tab === 'special' && <SpecialMaterialLogTab student={student} />}
          {tab === 'log' && <LogTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  )
}
