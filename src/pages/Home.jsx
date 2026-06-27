import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'

const ALL_MENU_OPTIONS = [
  { to: '/reagents/list',      label: '시약 목록',   sub: 'Reagent List',     icon: '🧪', color: '#EEF2FF', iconBg: '#667EEA' },
  { to: '/items',              label: '물품 목록',   sub: 'Supplies',         icon: '📦', color: '#F0FFF4', iconBg: '#38A169' },
  { to: '/reagents/locations', label: '시약장 위치', sub: 'Storage Location', icon: '📍', color: '#FFF5F5', iconBg: '#E53E3E' },
  { to: '/requests',           label: '구매 요청',   sub: 'Purchase Request', icon: '🛒', color: '#FFFBEB', iconBg: '#E8A020' },
  { to: '/inventory',          label: '재고 실사',   sub: 'Inventory Count',  icon: '📊', color: '#EEF2FF', iconBg: '#667EEA' },
  { to: '/admin',              label: '폐기 관리',   sub: 'Disposal',         icon: '🗑️', color: '#FFF5F5', iconBg: '#E53E3E' },
  { to: '/notices',            label: '공지사항',    sub: 'Notices',          icon: '📢', color: '#F0FFF4', iconBg: '#38A169' },
  { to: '/safety',             label: '안전관리',    sub: 'Safety',           icon: '🛡️', color: '#FFFBEB', iconBg: '#E8A020' },
]

const DEFAULT_QUICK = ['/reagents/list', '/items', '/reagents/locations', '/requests', '/inventory', '/admin']

// 예시 안전 브리핑 SVG 일러스트 (산+물)
const ExampleBriefingSVG = () => (
  <svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
    <rect width="200" height="120" fill="#EEF6FF" rx="8"/>
    {/* 비커 */}
    <rect x="70" y="50" width="60" height="50" rx="4" fill="#fff" stroke="#667EEA" strokeWidth="2"/>
    <rect x="65" y="45" width="70" height="10" rx="3" fill="#667EEA"/>
    {/* 물결 */}
    <path d="M70 75 Q85 68 100 75 Q115 82 130 75 L130 100 Q115 100 100 100 Q85 100 70 100 Z" fill="#90CDF4" opacity="0.7"/>
    {/* 산 방울 */}
    <ellipse cx="100" cy="40" rx="8" ry="10" fill="#FC8181" opacity="0.9"/>
    <path d="M100 50 L95 42 Q100 38 105 42 Z" fill="#FC8181" opacity="0.9"/>
    {/* 경고 화살표 */}
    <path d="M145 55 L160 55 L155 50 M160 55 L155 60" stroke="#E8A020" strokeWidth="2" fill="none" strokeLinecap="round"/>
    {/* 체크 */}
    <circle cx="170" cy="85" r="12" fill="#38A169"/>
    <path d="M164 85 L168 89 L176 81" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/>
    {/* 텍스트 */}
    <text x="100" y="18" textAnchor="middle" fontSize="10" fill="#2B4A8B" fontWeight="bold">⚠ 산 취급 주의</text>
  </svg>
)

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
  const [quickLinks, setQuickLinks] = useState([])
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => { fetchAll() }, [])

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
      fetchBriefings(), fetchMsds(), fetchRecentLogs(), fetchQuickLinks(),
    ])
  }

  async function fetchQuickLinks() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'quick_links').single()
    if (data?.value) {
      try {
        const paths = JSON.parse(data.value)
        setQuickLinks(paths.map(p => ALL_MENU_OPTIONS.find(m => m.to === p)).filter(Boolean))
      } catch { setQuickLinks(DEFAULT_QUICK.map(p => ALL_MENU_OPTIONS.find(m => m.to === p)).filter(Boolean)) }
    } else {
      setQuickLinks(DEFAULT_QUICK.map(p => ALL_MENU_OPTIONS.find(m => m.to === p)).filter(Boolean))
    }
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
    const { data } = await supabase.from('notices').select('*').eq('type', 'notice').order('created_at', { ascending: false }).limit(5)
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
      .eq('type', 'safety').order('created_at', { ascending: false }).limit(6)
    if (data) setMsdsFiles(data.filter(n => n.notice_files && n.notice_files.length > 0))
  }

  async function fetchRecentLogs() {
    const { data } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(5)
    if (data) setRecentLogs(data)
  }

  const briefing = briefings[currentBriefing]

  const statItems = [
    { icon: '🧪', label: '총 시약',      value: stats.reagents,        sub: '전체 시약 수', color: '#667EEA', bg: '#EEF2FF' },
    { icon: '📦', label: '총 물품',      value: stats.items,           sub: '전체 물품 수', color: '#38A169', bg: '#F0FFF4' },
    { icon: '⚠️', label: '유효기간 임박', value: stats.expiring,        sub: '30일 이내',   color: '#E8A020', bg: '#FFFBEB' },
    { icon: '📉', label: '재고 부족',    value: stats.lowStock,        sub: '10% 미만',    color: '#E53E3E', bg: '#FFF5F5' },
    { icon: '🛒', label: '구매 요청',    value: stats.pendingPurchase, sub: '승인 대기',   color: '#667EEA', bg: '#EEF2FF' },
    { icon: '✅', label: '이번달 폐기예정', value: stats.donePurchase,  sub: '승인 완료',   color: '#38A169', bg: '#F0FFF4' },
  ]

  return (
    <div>
      <PageBanner title="연구실 대시보드" sub="Lab Dashboard" breadcrumb={['홈']} />

      <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: '14px', alignItems: 'start' }}>

        {/* 왼쪽 메인 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* 현황 카드 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>오늘의 연구실 현황</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: C.muted }}>업데이트: {lastUpdated}</span>
                <button onClick={fetchAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: C.muted }}>↻</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
              {statItems.map(s => (
                <div key={s.label} style={{
                  background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px',
                  padding: '12px', boxShadow: '0 1px 3px rgba(26,42,94,0.05)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{s.icon}</div>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: C.muted }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: s.color, lineHeight: 1 }}>{s.value.toLocaleString()}</div>
                  <div style={{ fontSize: '9px', color: C.muted, marginTop: '3px' }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 안전 브리핑 */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>📢 오늘의 안전 브리핑</div>
              {briefings.length > 0 && <span style={{ fontSize: '10px', color: C.muted }}>{currentBriefing + 1} / {briefings.length}</span>}
            </div>
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 180px', gap: '16px', alignItems: 'center', minHeight: '130px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {briefings.length === 0 ? (
                  <>
                    <div style={{ fontSize: '11px', color: C.muted, fontWeight: '600', letterSpacing: '0.05em' }}>⚠ 산 취급 주의</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: C.navy, lineHeight: 1.4 }}>산은 항상 물에 넣어야 합니다.</div>
                    <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>산을 물에 넣으면 열이 발생할 수 있습니다. 반드시 산을 물에 천천히 넣어주세요.</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: C.navy, lineHeight: 1.4 }}>{briefing?.content}</div>
                    {briefings.length > 1 && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {briefings.map((_, i) => (
                          <div key={i} onClick={() => setCurrentBriefing(i)} style={{
                            width: i === currentBriefing ? '14px' : '5px', height: '5px',
                            borderRadius: '3px', cursor: 'pointer',
                            background: i === currentBriefing ? C.navy : C.border, transition: 'all 0.3s',
                          }} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ height: '110px' }}>
                <ExampleBriefingSVG />
              </div>
            </div>
          </div>

          {/* 최근 활동 */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>📋 최근 활동</div>
              <span onClick={() => navigate('/admin')} style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>더보기 →</span>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentLogs.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>최근 활동이 없습니다.</div>
                : recentLogs.map((log, i) => (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: i < recentLogs.length - 1 ? `1px solid ${C.border}` : 'none', paddingBottom: i < recentLogs.length - 1 ? '8px' : 0 }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{actionIcon(log.action)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: C.text, lineHeight: 1.3 }}>{log.description}</div>
                      <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>{log.admin_name}</div>
                    </div>
                    <span style={{ fontSize: '10px', color: C.muted, whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* 안전자료 바로가기 */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>📁 안전자료 바로가기</div>
              <span onClick={() => navigate('/safety')} style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>전체보기 →</span>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {msdsFiles.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>등록된 자료가 없습니다.</div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {msdsFiles.map(n => (
                      <a key={n.id} href={n.notice_files[0]?.file_url} target="_blank" rel="noreferrer" style={{
                        background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px',
                        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px',
                        textDecoration: 'none', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.background = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg }}
                      >
                        <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#FFF5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>📄</div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: C.navy, lineHeight: 1.3 }}>{n.title}</div>
                          <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>{n.notice_files[0]?.file_name}</div>
                        </div>
                      </a>
                    ))}
                  </div>
              }
            </div>
          </div>

        </div>

        {/* 오른쪽 사이드 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* 빠른 메뉴 */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>빠른 메뉴</div>
            </div>
            <div style={{ padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {quickLinks.map(item => (
                <button key={item.to} onClick={() => navigate(item.to)} style={{
                  background: item.color || C.bg, border: `1px solid ${C.border}`, borderRadius: '8px',
                  padding: '10px 6px', cursor: 'pointer', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: item.iconBg || C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>{item.icon}</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: C.navy, lineHeight: 1.2 }}>{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 실험실 규칙 */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>🛡️ 실험실 규칙</div>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rules.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '10px 0' }}>등록된 규칙이 없습니다.</div>
                : rules.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ minWidth: '20px', height: '20px', background: C.navy, color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0, marginTop: '1px' }}>{i + 1}</span>
                    <span style={{ fontSize: '12px', color: C.text, lineHeight: 1.5 }}>{r.content}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* 공지사항 */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,42,94,0.05)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>📣 공지사항</div>
              <span onClick={() => navigate('/notices')} style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>전체보기 →</span>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notices.length === 0
                ? <div style={{ color: C.muted, fontSize: '12px', textAlign: 'center', padding: '10px 0' }}>등록된 공지사항이 없습니다.</div>
                : notices.map((n, i) => (
                  <div key={n.id} onClick={() => navigate(`/notices/${n.id}`)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: i < notices.length - 1 ? `1px solid ${C.border}` : 'none',
                    paddingBottom: i < notices.length - 1 ? '8px' : 0, cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                      <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: C.gold, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: C.muted, whiteSpace: 'nowrap', marginLeft: '8px' }}>{new Date(n.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}</span>
                  </div>
                ))}
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
