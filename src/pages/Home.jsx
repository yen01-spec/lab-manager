import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

function Home() {
  const { isAdmin } = useOutletContext?.() || {}
  const [notices, setNotices] = useState([])
  const [safetyInfos, setSafetyInfos] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchNotices()
    fetchSafetyInfos()
  }, [])

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .eq('type', 'notice')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setNotices(data)
  }

  async function fetchSafetyInfos() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .eq('type', 'safety')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setSafetyInfos(data)
  }

  return (
    <div>
      {/* 연구실 정보 헤더 */}
      <div style={{
        background: '#1e3a5f', color: 'white',
        borderRadius: '10px', padding: '20px 24px', marginBottom: '24px',
      }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>📋 연구실 책임자</h2>
        <p style={{ margin: 0, opacity: 0.85, fontSize: '14px' }}>
          교수님: OOO 교수 &nbsp;|&nbsp; 담당 조교: OOO &nbsp;|&nbsp; 연락처: 000-0000-0000
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* 공지사항 */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: '16px', fontWeight: '700' }}>📢 공지사항</h2>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {notices.length === 0 ? (
              <p style={{ color: '#a0aec0', margin: 0 }}>공지사항이 없습니다.</p>
            ) : (
              notices.map((n, i) => (
                <div key={n.id} style={{
                  borderBottom: i < notices.length - 1 ? '1px solid #f0f0f0' : 'none',
                  paddingBottom: i < notices.length - 1 ? '12px' : 0,
                  marginBottom: i < notices.length - 1 ? '12px' : 0,
                }}>
                  <div
                    onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
                  >
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#2d3748', flex: 1 }}>{n.title}</span>
                    <span style={{ color: '#a0aec0', fontSize: '11px', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {expandedId === n.id && n.content && (
                    <p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                      {n.content}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 연구실 안전관리 */}
        <div style={{ border: '1px solid #fbd38d', borderRadius: '10px', background: 'white', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: '#fffff0', borderBottom: '1px solid #fbd38d' }}>
            <h2 style={{ margin: 0, color: '#b7791f', fontSize: '16px', fontWeight: '700' }}>🦺 연구실 안전관리</h2>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {safetyInfos.length === 0 ? (
              <p style={{ color: '#a0aec0', margin: 0 }}>등록된 안전 정보가 없습니다.</p>
            ) : (
              safetyInfos.map((s, i) => (
                <div key={s.id} style={{
                  borderBottom: i < safetyInfos.length - 1 ? '1px solid #fef3c7' : 'none',
                  paddingBottom: i < safetyInfos.length - 1 ? '12px' : 0,
                  marginBottom: i < safetyInfos.length - 1 ? '12px' : 0,
                }}>
                  <div
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
                  >
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#92400e', flex: 1 }}>🔶 {s.title}</span>
                    <span style={{ color: '#a0aec0', fontSize: '11px', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {expandedId === s.id && s.content && (
                    <p style={{ margin: '8px 0 0', color: '#78350f', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                      {s.content}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 빠른 링크 */}
      <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { icon: '🧪', label: '시약 목록', to: '/reagents/list' },
          { icon: '📦', label: '물품 관리', to: '/items' },
          { icon: '🛒', label: '구매 요청', to: '/requests' },
          { icon: '📅', label: '달력', to: '/calendar' },
        ].map(item => (
          <a key={item.to} href={item.to} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px', border: '1px solid #e2e8f0', borderRadius: '10px',
            background: 'white', textDecoration: 'none', gap: '8px',
            transition: 'box-shadow 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <span style={{ fontSize: '28px' }}>{item.icon}</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a5f' }}>{item.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default Home
