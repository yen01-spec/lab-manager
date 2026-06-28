import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, Icon, PageBanner, StockBar, EmptyState } from '../design'

// ── 아이콘 매핑 (Material Symbols) ───────────────────────
const QUICK_MENU = [
  { to: '/reagents/list',      label: '시약 목록',   icon: 'science'          },
  { to: '/items',              label: '물품 목록',   icon: 'inventory_2'      },
  { to: '/reagents/locations', label: '시약장 위치', icon: 'location_on'      },
  { to: '/requests',           label: '구매 요청',   icon: 'shopping_cart'    },
  { to: '/inventory',          label: '재고 실사',   icon: 'checklist'        },
  { to: '/admin',              label: '폐기 관리',   icon: 'delete'           },
]

const LOG_ICON = { '추가': 'science', '이동': 'location_on', '폐기': 'delete', '구매': 'shopping_cart', '승인': 'check_circle', '반려': 'cancel' }
function logIcon(action) {
  if (!action) return 'description'
  const key = Object.keys(LOG_ICON).find(k => action.includes(k))
  return LOG_ICON[key] || 'description'
}

// ── 공통 카드 ────────────────────────────────────────────
function Card({ title, titleExtra, children, noPadding }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(16,24,40,.06)', overflow: 'hidden' }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: C.navyDeep }}>{title}</span>
          {titleExtra}
        </div>
      )}
      <div style={noPadding ? {} : { padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()

  const [stats, setStats] = useState({ reagents: 0, items: 0, expiring: 0, lowStock: 0, pendingPurchase: 0, disposal: 0 })
  const [lowStockList, setLowStockList] = useState([])
  const [notices, setNotices] = useState([])
  const [briefings, setBriefings] = useState([])
  const [currentBriefing, setCurrentBriefing] = useState(0)
  const [msdsFiles, setMsdsFiles] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => {
    if (briefings.length < 2) return
    const t = setInterval(() => setCurrentBriefing(i => (i + 1) % briefings.length), 10000)
    return () => clearInterval(t)
  }, [briefings])

  async function fetchAll() {
    setLoading(true)
    setLastUpdated(new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))
    await Promise.all([fetchStats(), fetchLowStock(), fetchNotices(), fetchBriefings(), fetchMsds(), fetchRecentLogs()])
    setLoading(false)
  }

  async function fetchStats() {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date(); soon.setDate(soon.getDate() + 30)
    const soonStr = soon.toISOString().split('T')[0]
    const [
      { count: reagents }, { count: items }, { count: expiring },
      { count: lowReagents }, { count: lowItems },
      { count: pendingPurchase },
    ] = await Promise.all([
      supabase.from('reagents').select('*', { count: 'exact', head: true }),
      supabase.from('items').select('*', { count: 'exact', head: true }),
      supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).lte('expiry_date', soonStr).gte('expiry_date', today),
      supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).eq('sealed_count', 0).lte('current_stock', 10),
      supabase.from('item_lots').select('*', { count: 'exact', head: true }).eq('sealed_count', 0).lte('current_stock', 10),
      supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setStats({ reagents: reagents||0, items: items||0, expiring: expiring||0, lowStock: (lowReagents||0)+(lowItems||0), pendingPurchase: pendingPurchase||0, disposal: 0 })
  }

  async function fetchLowStock() {
    const { data } = await supabase.from('reagent_lots')
      .select('*, reagents(name, location)')
      .eq('sealed_count', 0).lte('current_stock', 10)
      .order('current_stock').limit(5)
    if (data) setLowStockList(data)
  }

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*').eq('type', 'notice').order('created_at', { ascending: false }).limit(4)
    if (data) setNotices(data)
  }
  async function fetchBriefings() {
    const { data } = await supabase.from('safety_briefings').select('*').order('created_at', { ascending: false })
    if (data) { setBriefings(data); setCurrentBriefing(0) }
  }
  async function fetchMsds() {
    const { data } = await supabase.from('notices')
      .select('id, title, notice_files(file_url, file_name)').eq('type', 'safety')
      .order('created_at', { ascending: false }).limit(4)
    if (data) setMsdsFiles(data.filter(n => n.notice_files?.length > 0))
  }
  async function fetchRecentLogs() {
    const { data } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(5)
    if (data) setRecentLogs(data)
  }

  const briefing = briefings[currentBriefing]

  const STAT_ITEMS = [
    { icon: 'science',        label: '총 시약',     value: stats.reagents,        sub: '전체 시약 수', alert: false },
    { icon: 'inventory_2',    label: '총 물품',     value: stats.items,           sub: '전체 물품 수', alert: false },
    { icon: 'schedule',       label: '유효기간 임박', value: stats.expiring,      sub: '30일 이내',    alert: stats.expiring > 0 },
    { icon: 'error',          label: '재고 부족',   value: stats.lowStock,        sub: '재고 10% 미만', alert: stats.lowStock > 0, red: true },
    { icon: 'shopping_cart',  label: '구매 요청',   value: stats.pendingPurchase, sub: '승인 대기',    alert: false },
    { icon: 'delete',         label: '폐기 예정',   value: stats.disposal,        sub: '이번 달',      alert: false },
  ]

  return (
    <div>
      <PageBanner
        title="연구실 대시보드"
        sub="Lab Dashboard"
        breadcrumb={[]}
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>업데이트 {lastUpdated}</span>
            <button onClick={fetchAll} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <Icon name="refresh" size={16} color={C.muted} />
            </button>
          </div>
        }
      />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── 통계 카드 6개 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {STAT_ITEMS.map(s => {
            const inactive = s.value === 0 && !s.red
            return (
              <div key={s.label} style={{
                background: C.white,
                border: `1px solid ${s.red && s.value > 0 ? '#F3D6D6' : C.border}`,
                borderRadius: 12, padding: 15,
                boxShadow: s.red && s.value > 0 ? 'inset 0 0 0 1px #FBEAEA, 0 1px 3px rgba(16,24,40,.06)' : '0 1px 3px rgba(16,24,40,.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <Icon name={s.icon} size={17} color={inactive ? '#C2C8D2' : s.red && s.value > 0 ? C.danger : C.blue} />
                  <span style={{ fontSize: 11.5, color: s.red && s.value > 0 ? C.dangerDark : '#737B88', fontWeight: s.red && s.value > 0 ? 600 : 500 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: inactive ? '#B6BCC6' : s.red && s.value > 0 ? '#D23B40' : C.navyDeep }}>
                  {s.value.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.sub}</div>
              </div>
            )
          })}
        </div>

        {/* ── 2단 본문 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.62fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* 좌측 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 안전 브리핑 */}
            <div style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 20, display: 'flex', gap: 18, alignItems: 'center',
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(16,24,40,.06)',
            }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: C.danger }} />
              <div style={{ flex: 1, paddingLeft: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: C.dangerDark, background: C.dangerTint, padding: '3px 8px', borderRadius: 6 }}>
                    오늘의 안전 브리핑
                  </span>
                  <span style={{ fontSize: 11.5, color: C.muted }}>{briefing?.category || '산 취급 주의'}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.navyDeep, letterSpacing: '-0.3px', marginBottom: 6 }}>
                  {briefing?.content || '산은 항상 물에 넣어야 합니다.'}
                </div>
                <div style={{ fontSize: 12.5, color: C.textSub, lineHeight: 1.6 }}>
                  {briefing?.detail || '산을 물에 넣으면 열이 발생할 수 있습니다. 반드시 산을 물에 천천히 넣어주세요.'}
                </div>
              </div>
              {briefings.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => setCurrentBriefing(i => (i - 1 + briefings.length) % briefings.length)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
                    <Icon name="expand_less" size={20} color={C.muted} />
                  </button>
                  <span style={{ fontSize: 10, color: C.muted }}>{currentBriefing + 1}/{briefings.length}</span>
                  <button onClick={() => setCurrentBriefing(i => (i + 1) % briefings.length)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Icon name="expand_more" size={20} color={C.muted} />
                  </button>
                </div>
              )}
            </div>

            {/* 재고 부족 시약 */}
            <Card
              title="재고 부족 시약"
              noPadding
              titleExtra={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {stats.lowStock > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.dangerDark, background: C.dangerTint, padding: '2px 8px', borderRadius: 999 }}>
                      {stats.lowStock}건
                    </span>
                  )}
                  <button onClick={() => navigate('/reagents/list')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.blue, fontWeight: 600, fontFamily: 'inherit' }}>
                    전체 보기 ›
                  </button>
                </div>
              }
            >
              {lowStockList.length === 0
                ? <EmptyState icon="check_circle" message="재고 부족 시약이 없습니다" />
                : lowStockList.map(lot => {
                    const pct = lot.max_stock > 0 ? Math.round((lot.current_stock / lot.max_stock) * 100) : 0
                    return (
                      <div key={lot.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px',
                        borderBottom: `1px solid ${C.borderRow}`,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.navyDeep, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lot.reagents?.name || '시약명 없음'}
                          </div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
                            {lot.reagents?.location || '위치 미지정'}
                          </div>
                        </div>
                        <StockBar pct={pct} />
                        <div style={{ width: 34, textAlign: 'right', fontSize: 12, fontWeight: 600, color: C.dangerDark }}>{pct}%</div>
                        <button
                          onClick={() => navigate('/requests')}
                          style={{ fontSize: 11.5, fontWeight: 600, color: C.blue, background: C.blueTint, border: 'none', padding: '6px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                        >
                          요청
                        </button>
                      </div>
                    )
                  })
              }
            </Card>

            {/* 최근 활동 */}
            <Card title="최근 활동" noPadding
              titleExtra={
                <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.blue, fontWeight: 600, fontFamily: 'inherit' }}>
                  더보기 ›
                </button>
              }
            >
              {recentLogs.length === 0
                ? <EmptyState icon="history" message="최근 활동이 없습니다" />
                : recentLogs.map((log, i) => (
                  <div key={log.id} style={{
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '10px 20px', borderBottom: i < recentLogs.length - 1 ? `1px solid ${C.borderRow}` : 'none',
                  }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: C.blueTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={logIcon(log.action)} size={16} color={C.blue} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#3A4250' }}>{log.description}</div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{log.admin_name}</div>
                    </div>
                    <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              }
            </Card>
          </div>

          {/* 우측 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 빠른 메뉴 */}
            <Card title="빠른 메뉴">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, margin: '-4px 0' }}>
                {QUICK_MENU.map(item => (
                  <button key={item.to} onClick={() => navigate(item.to)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                    padding: '13px 6px', border: `1px solid ${C.border}`, borderRadius: 10,
                    background: C.white, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.blueTint; e.currentTarget.style.borderColor = 'rgba(47,107,219,0.25)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.border }}
                  >
                    <Icon name={item.icon} size={21} color={C.blue} />
                    <span style={{ fontSize: 11.5, color: '#3A4250', fontWeight: 500, textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* 공지사항 */}
            <Card title="공지사항" noPadding
              titleExtra={
                <button onClick={() => navigate('/notices')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.blue, fontWeight: 600, fontFamily: 'inherit' }}>
                  더보기 ›
                </button>
              }
            >
              {notices.length === 0
                ? <EmptyState icon="campaign" message="공지사항이 없습니다" />
                : notices.map((n, i) => (
                  <div key={n.id} onClick={() => navigate(`/notices/${n.id}`)} style={{
                    display: 'flex', gap: 9, alignItems: 'flex-start',
                    padding: '10px 20px', borderBottom: i < notices.length - 1 ? `1px solid ${C.borderRow}` : 'none',
                    cursor: 'pointer',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                      padding: '2px 7px', borderRadius: 6,
                      ...(n.is_important
                        ? { color: C.dangerDark, background: C.dangerTint }
                        : { color: C.blueDark, background: C.blueTint })
                    }}>{n.is_important ? '중요' : '일반'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: '#3A4250', lineHeight: 1.45 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {new Date(n.created_at).toLocaleDateString('ko-KR')}
                      </div>
                    </div>
                  </div>
                ))
              }
            </Card>

            {/* MSDS 바로가기 */}
            <div onClick={() => navigate('/safety')} style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 11,
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(16,24,40,.06)', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(47,107,219,0.3)'; e.currentTarget.style.background = '#FAFBFD' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.white }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.warningTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="description" size={19} color={C.warningDark} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.navyDeep }}>안전자료(MSDS) 바로가기</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>연구실 설치운영 기준 이행 안내서</div>
              </div>
              <Icon name="chevron_right" size={18} color={C.muted} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
