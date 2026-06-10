import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card } from './design'

const QUICK_LINKS = [
  { icon: '📍', label: '시약장 위치', sub: 'Storage Location', to: '/reagents/locations' },
  { icon: '🧪', label: '시약 목록',   sub: 'Reagent List',     to: '/reagents/list' },
  { icon: '📦', label: '물품 관리',   sub: 'Supplies',         to: '/items' },
  { icon: '🛒', label: '구매 요청',   sub: 'Purchase Request', to: '/requests' },
]

export default function Home() {
  const navigate = useNavigate()
  const [notices, setNotices] = useState([])
  const [safetyInfos, setSafetyInfos] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchNotices()
    fetchSafetyInfos()
  }, [])

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*')
      .eq('type', 'notice').order('created_at', { ascending: false }).limit(6)
    if (data) setNotices(data)
  }

  async function fetchSafetyInfos() {
    const { data } = await supabase.from('notices').select('*')
      .eq('type', 'safety').order('created_at', { ascending: false }).limit(5)
    if (data) setSafetyInfos(data)
  }

  return (
    <div>
      <PageBanner
        title="연구실 시약관리 시스템"
        sub="Lab Chemical Management"
        breadcrumb={['홈']}
      />

      <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

        {/* 연구실 정보 */}
        <div style={{
          background: C.navy, borderRadius: '10px', padding: '20px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(26,42,94,0.18)',
        }}>
          <div>
            <div style={{ color: C.gold, fontSize: '11px', fontWeight: '700',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
              연구실 책임자
            </div>
            <div style={{ color: C.white, fontSize: '14px', lineHeight: 1.8 }}>
              교수님: <strong>OOO</strong> 교수&nbsp;&nbsp;|&nbsp;&nbsp;
              담당 조교: <strong>OOO</strong>&nbsp;&nbsp;|&nbsp;&nbsp;
              연락처: <strong>000-0000-0000</strong>
            </div>
          </div>
          <div style={{
            width: '48px', height: '48px', background: C.gold,
            borderRadius: '10px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '22px',
          }}>🔬</div>
        </div>

        {/* 빠른 바로가기 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {QUICK_LINKS.map(item => (
            <button key={item.to} onClick={() => navigate(item.to)} style={{
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: '10px', padding: '20px 16px',
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', flexDirection: 'column', gap: '8px',
              boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(26,42,94,0.12)'
                e.currentTarget.style.borderColor = C.gold
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(26,42,94,0.06)'
                e.currentTarget.style.borderColor = C.border
                e.currentTarget.style.transform = 'none'
              }}
            >
              <span style={{ fontSize: '24px' }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: '10px', color: C.muted, letterSpacing: '0.05em',
                  textTransform: 'uppercase', marginBottom: '2px' }}>{item.sub}</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy }}>{item.label}</div>
              </div>
              <div style={{ color: C.gold, fontSize: '16px', marginTop: 'auto' }}>→</div>
            </button>
          ))}
        </div>

        {/* 공지사항 + 안전관리 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* 공지사항 */}
          <Card title="공지사항" sub="Notices"
            extra={
              <span style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>전체보기 →</span>
            }>
            {notices.length === 0
              ? <EmptyState text="등록된 공지사항이 없습니다." />
              : notices.map((n, i) => (
                <NoticeRow key={n.id} item={n} index={i} total={notices.length}
                  expanded={expandedId === n.id}
                  onToggle={() => setExpandedId(expandedId === n.id ? null : n.id)} />
              ))}
          </Card>

          {/* 연구실 안전관리 */}
          <Card
            title="연구실 안전관리"
            sub="Safety Management"
            extra={
              <span style={{
                background: '#FFF8E7', color: C.gold,
                fontSize: '11px', fontWeight: '700',
                padding: '3px 10px', borderRadius: '10px',
              }}>중요</span>
            }>
            {safetyInfos.length === 0
              ? <EmptyState text="등록된 안전 정보가 없습니다." />
              : safetyInfos.map((s, i) => (
                <NoticeRow key={s.id} item={s} index={i} total={safetyInfos.length}
                  isSafety
                  expanded={expandedId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)} />
              ))}
          </Card>
        </div>

      </div>
    </div>
  )
}

function NoticeRow({ item, index, total, isSafety, expanded, onToggle }) {
  return (
    <div style={{
      borderBottom: index < total - 1 ? `1px solid ${C.border}` : 'none',
      paddingBottom: index < total - 1 ? '12px' : 0,
      marginBottom: index < total - 1 ? '12px' : 0,
    }}>
      <div onClick={onToggle} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        cursor: 'pointer', gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1 }}>
          {isSafety && (
            <span style={{
              flexShrink: 0, marginTop: '1px',
              width: '6px', height: '6px', borderRadius: '50%',
              background: C.gold, display: 'inline-block', marginTop: '5px',
            }} />
          )}
          <span style={{ fontSize: '13px', fontWeight: '600', color: C.text, lineHeight: 1.4 }}>
            {item.title}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: C.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {new Date(item.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
        </span>
      </div>
      {expanded && item.content && (
        <div style={{
          marginTop: '8px', padding: '10px 12px',
          background: C.bg, borderRadius: '6px',
          fontSize: '13px', color: C.muted, lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}>{item.content}</div>
      )}
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: '13px' }}>
      {text}
    </div>
  )
}
