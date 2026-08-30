import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'
import ReagentAddTab from '../components/admin/ReagentAddTab'
import ItemAddTab from '../components/admin/ItemAddTab'
import DisposalTab from '../components/admin/DisposalTab'
import MoveTab from '../components/admin/MoveTab'
import NoticeTab from '../components/admin/NoticeTab'
import PurchaseTab from '../components/admin/PurchaseTab'
import ReceiptTab from '../components/admin/ReceiptTab'
import ManageTab from '../components/admin/ManageTab'
import LogTab from '../components/admin/LogTab'
import BulkUpdateTab from '../components/admin/BulkUpdateTab'
import ChangeRequestTab from '../components/admin/ChangeRequestTab'
import SuperTab from '../components/admin/SuperTab'

export default function Admin() {
  const { isAdmin, isSuper, student } = useOutletContext()
  const TABS = [
    { key: 'notice', label: '공지/안전관리', icon: '📢', sub: 'Notice' },
  { key: 'changereq', label: '변경 요청', icon: '📝', sub: 'Change Requests' },
  { key: 'reagent',  label: '시약 추가',      icon: '🧪', sub: 'Add Reagent' },
  { key: 'item',     label: '물품 추가',       icon: '📦', sub: 'Add Item' },
  { key: 'disposal', label: '폐기 관리',       icon: '🗑️', sub: 'Disposal' },
  { key: 'move',     label: '위치 이동',       icon: '📍', sub: 'Move' },
  { key: 'update',   label: '정보 일괄갱신',   icon: '🔄', sub: 'Bulk Update' },
  { key: 'purchase', label: '구매 관리',       icon: '🛒', sub: 'Purchase' },
  { key: 'receipt',  label: '영수증 관리',     icon: '🧾', sub: 'Receipt' },
  { key: 'manage',   label: '관리',            icon: '⚠️', sub: 'Manage' },
  { key: 'log',      label: '변경 로그',       icon: '📋', sub: 'Logs' },
  ...(isSuper ? [{ key: 'super', label: '슈퍼관리자', icon: '👑', sub: 'Super Admin' }] : []),
]
  const navigate = useNavigate()
  const [tab, setTab] = useState('reagent')
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
          width: '180px', flexShrink: 0, background: '#fff', borderRadius: '10px',
          border: `1px solid ${C.border}`, padding: '12px 0', height: 'fit-content',
          position: 'sticky', top: '80px', boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
        }}>
          <div style={{ padding: '8px 16px 12px', fontSize: '10px', fontWeight: '700',
            color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>관리자 메뉴</div>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              width: '100%', padding: '9px 16px', border: 'none',
              background: tab === t.key ? '#EEF2FB' : 'transparent',
              color: tab === t.key ? C.navy : C.text,
              fontWeight: tab === t.key ? '700' : '400',
              fontSize: '13px', cursor: 'pointer', textAlign: 'left',
              borderLeft: tab === t.key ? `3px solid ${C.gold}` : '3px solid transparent',
            }}>
              <span>{t.icon}</span>
              <div>
                <div>{t.label}</div>
                <div style={{ fontSize: '10px', color: C.muted }}>{t.sub}</div>
              </div>
              {t.key === 'purchase' && pendingCount > 0 && (
                <span style={{ marginLeft: 'auto', background: C.danger, color: '#fff',
                  fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 6px' }}>{pendingCount}</span>
              )}
              {t.key === 'disposal' && disposalCount > 0 && (
                <span style={{ marginLeft: 'auto', background: C.danger, color: '#fff',
                  fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 6px' }}>{disposalCount}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === 'notice' && <NoticeTab />}
          {tab === 'changereq' && <ChangeRequestTab student={student} />}
          {tab === 'reagent'  && <ReagentAddTab locations={locations} student={student} />}
          {tab === 'item'     && <ItemAddTab locations={locations} />}
          {tab === 'disposal' && <DisposalTab onCountChange={fetchDisposalCount} student={student} />}
          {tab === 'move'     && <MoveTab locations={locations} />}
          {tab === 'update' && <BulkUpdateTab />}
          {tab === 'purchase' && <PurchaseTab onCountChange={fetchPendingCount} />}
          {tab === 'receipt'  && <ReceiptTab />}
          {tab === 'manage'   && <ManageTab />}
          {tab === 'log'      && <LogTab />}
          {tab === 'super' && isSuper && <SuperTab />}
        </div>
      </div>
    </div>
  )
}
