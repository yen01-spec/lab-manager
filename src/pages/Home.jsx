import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card } from '../design'

const QUICK_LINKS = [
  { icon: '🧪', label: '시약 목록',   sub: 'Reagent List',     to: '/reagents/list' },
  { icon: '📦', label: '물품 목록',   sub: 'Supplies',         to: '/items' },
  { icon: '📍', label: '시약장 위치', sub: 'Storage Location', to: '/reagents/locations' },
  { icon: '🛒', label: '구매 요청',   sub: 'Purchase Request', to: '/requests' },
]

export default function Home() {
  const navigate = useNavigate()
  const { isSuper } = useOutletContext?.() || {}

  const [stats, setStats] = useState({ reagents: 0, items: 0, expiring: 0, lowStock: 0, pendingPurchase: 0, donePurchase: 0 })
  const [notices, setNotices] = useState([])
  const [rules, setRules] = useState([])
  const [briefings, setBriefings] = useState([])
  const [currentBriefing, setCurrentBriefing] = useState(0)
  const [msdsFiles, setMsdsFiles] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => {
    fetchAll()
    const interval = setInterval(() => {
      setCurrentBriefing(i => {
        setBriefings(prev => {
          if (prev.length === 0) return prev
          return prev
        })
        return i // 실제 증가는 briefings 길이 알아야 해서 아래 별도 처리
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // briefings 로드 후 인터벌 재설정
  useEffect(() => {
    if (briefings.length === 0) return
    const interval = setInterval(() => {
      setCurrentBriefing(i => (i + 1) % briefings.length)
    }, 10000)
    return () => clearInterval(interval)
  }, [briefings])

  async function fetchAll() {
    setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    await Promise.all([
      fetchStats(), fetchNotices(), fetchRules(),
      fetchBriefings(), fetchMsds(), fetchRecentLogs(),
    ])
  }

  async function fetchStats() {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date(); soon.setDate(soon.getDate() + 30)
    const soonStr = soon.toISOString().split('T')[0]
    const [
      { count: reagents }, { count: items }, { count: expiring },
      { count: lowReagents }, { count: lowItems },
      { count: pendingPurchase }, { count: donePurchase },
    ] = await Promise.all([
      supabase.from('reagents').select('*', { count: 'exact', head: true }),
      supabase.from('items').select('*', { count: 'exact', head: true }),
      supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).lte('expiry_date', soonStr).gte('expiry_date', today),
      supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).eq('sealed_count', 0).lte('current_stock', 10),
      supabase.from('item_lots').select('*', { count: 'exact', head: true }).eq('sealed_count', 0).lte('current_stock', 10),
      supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'done'),
    ])
    setStats({ reagents: reagents||0, items: items||0, expiring: expiring||0, lowStock: (lowReagents||0)+(lowItems||0), pendingPurchase: pendingPurchase||0, donePurchase: donePurchase||0 })
  }

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*').eq('type', 'notice').order('created_at', { ascending: false }).limit(4)
    if (data) setNotices(data)
  }

  async function fetchRules() {
    const { data } = await supabase.from('lab_rules').select('*').order('order_no')
    if (data) setRules(data)
  }

  async function fetchBriefings() {
    const { data } = await supabase.from('safety_briefings').select('*').order('created_at', { ascending: false })
    if (data) { setBriefings(data); setCurrentBriefing(0) }
  }

  async function fetchMsds() {
    const { data } = await supabase.from('notices')
      .select('id, title, notice_files(file_url, file_name)')
      .eq('type', 'safety').order('created_at', { ascending: false }).limit(8)
    if (data) setMsdsFiles(data.filter(n => n.notice_files && n.notice_files.length > 0))
  }

  async function fetchRecentLogs() {
    const { data } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(4)
    if (data) setRecentLogs(data)
  }

  const briefing = briefings[currentBriefing]

  const statItems = [
    { icon: '🧪', label: '총 시약', value: stats.reagents, sub: '전체 시약 수', color: C.navy },
    { icon: '📦', label: '총 물품', value: stats.items, sub: '전체 물품 수', color: C.navy },
    { icon: '⚠️', label: '유효기간 임박', value: stats.expiring, sub: '30일 이내', color: '#E8A020' },
    { icon: '📉', label: '재고 부족', value: stats.lowStock, sub: '10% 미만', color: '#E53E3E' },
    { icon: '🛒', label: '구매 대기', value: stats.pendingPurchase, sub: '승인 대기', color: '#667EEA' },
    { icon: '✅', label: '구매 완료', value: stats.donePurchase, sub: '승인 완료', color: '#38A169' },
  ]

  return (
    <div>
      <PageBanner title="연구실 대시보드" sub="Lab Dashboard" breadcrumb={['홈']} />

      <div style={{ padding: '16px 32px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* 현황 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
          {statItems.map(s => (
            <div key={s.label} style={{
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px',
              padding: '12px 14px', boxShadow: '0 1px 3px rgba(26,42,94,0.05)',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '20px' }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: s.color, lineHeight: 1 }}>{s.value.toLocaleString()}</div>
                <div style={{ fontSize: '10px', fontWeight: '600', color: C.muted, marginTop: '2px' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 빠른메뉴 + 안전브리핑 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

          {/* 빠른 메뉴 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {QUICK_LINKS.map(item => (
              <button key={item.to} onClick={() => navigate(item.to)} style={{
                background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px',
                padding: '14px', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: '10px',
                boxShadow: '0 1px 3px rgba(26,42,94,0.05)', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none' }}
              >
                <span style={{ fontSize: '22px' }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>{item.label}</div>
                  <div style={{ fontSize: '10px', color: C.muted }}>{item.sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* 안전 브리핑 */}
          <div style={{
            background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px',
            padding: '16px 20px', boxShadow: '0 1px 3px rgba(26,42,94,0.05)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '10px' }}>
              📢 오늘의 안전 브리핑
            </div>
            {briefings.length === 0
              ? <div style={{ color: C.muted, fontSize: '13px' }}>등록된 브리핑이 없습니다.</div>
              : <p style={{ fontSize: '13px', color: C.text, lineHeight: 1.8, margin: 0, flex: 1 }}>{briefing?.content}</p>
            }
            {briefings.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {briefings.map((_, i) => (
                    <div key={i} onClick={() => setCurrentBriefing(i)} style={{
                      width: i === currentBriefing ? '14px' : '5px', height: '5px',
                      borderRadius: '3px', cursor: 'pointer',
                      background: i === currentBriefing ? C.navy : C.border, transition: 'all 0.3s',
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: '10px', color: C.muted }}>{currentBriefing + 1} / {briefings.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* 공지사항 + 최근활동 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>공지사항</div>
              <span onClick={() => navigate('/notices')} style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>전체보기 →</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notices.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>등록된 공지사항이 없습니다.</div>
                : notices.map((n, i) => (
                  <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < notices.length - 1 ? `1px solid ${C.border}` : 'none', paddingBottom: i < notices.length - 1 ? '8px' : 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: C.text }}>{n.title}</span>
                    <span style={{ fontSize: '10px', color: C.muted, whiteSpace: 'nowrap', marginLeft: '8px' }}>{new Date(n.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>
                  </div>
                ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>최근 활동</div>
              <span onClick={() => navigate('/admin')} style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>더보기 →</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentLogs.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>최근 활동이 없습니다.</div>
                : recentLogs.map((log, i) => (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: i < recentLogs.length - 1 ? `1px solid ${C.border}` : 'none', paddingBottom: i < recentLogs.length - 1 ? '8px' : 0 }}>
                    <span style={{ fontSize: '14px' }}>{actionIcon(log.action)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.3 }}>{log.description}</div>
                      <div style={{ fontSize: '10px', color: C.muted }}>{log.admin_name}</div>
                    </div>
                    <span style={{ fontSize: '10px', color: C.muted, whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* 실험실 규칙 + MSDS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>실험실 규칙</div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {rules.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>등록된 규칙이 없습니다.</div>
                : rules.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ minWidth: '18px', height: '18px', background: C.navy, color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0, marginTop: '1px' }}>{i + 1}</span>
                    <span style={{ fontSize: '12px', color: C.text, lineHeight: 1.5 }}>{r.content}</span>
                  </div>
                ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>안전 관리 자료</div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {msdsFiles.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>등록된 자료가 없습니다.</div>
                : <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {msdsFiles.map(n => (
                      <a key={n.id} href={n.notice_files[0]?.file_url} target="_blank" rel="noreferrer" style={{
                        flexShrink: 0, width: '90px', background: C.bg,
                        border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 8px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                        textDecoration: 'none', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}
                      >
                        <span style={{ fontSize: '20px' }}>📄</span>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: C.navy, textAlign: 'center', lineHeight: 1.3, wordBreak: 'keep-all' }}>{n.title}</div>
                      </a>
                    ))}
                  </div>
              }
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function actionIcon(action) {
  if (!action) return '📋'
  if (action.includes('추가')) return '✅'
  if (action.includes('이동')) return '📍'
  if (action.includes('폐기')) return '🗑️'
  if (action.includes('구매') || action.includes('발주')) return '🛒'
  if (action.includes('승인')) return '✔️'
  if (action.includes('반려')) return '❌'
  return '📋'
}
