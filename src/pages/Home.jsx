import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, Icon, PageBanner, inputStyle } from '../design'

const QUICK_MENU = [
  { to: '/reagents/list',    label: '시약 검색',   sub: '위치·잔량 바로 확인',     icon: 'science'   },
  { to: '/inventory',        label: '재고실사',     sub: '진행 중인 실사 이어하기', icon: 'checklist' },
  { to: '/purchase-request', label: '구매요청서',   sub: '필요 물품 담아 내보내기', icon: 'shopping_cart' },
  { to: '/notices',          label: '자료실',       sub: '안전수칙·공지·MSDS',      icon: 'description' },
]

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
  const { student } = useOutletContext?.() || {}
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ reagents: 0, confirmedPct: 0, expiring: 0, myPending: 0 })
  const [recentConfirms, setRecentConfirms] = useState([])

  useEffect(() => { fetchAll() }, [student?.student_id])

  async function fetchAll() {
    await Promise.all([fetchStats(), fetchRecentConfirms()])
  }

  async function fetchStats() {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date(); soon.setDate(soon.getDate() + 30)
    const soonStr = soon.toISOString().split('T')[0]
    const yearStart = `${new Date().getFullYear()}-01-01`

    const queries = [
      supabase.from('reagents').select('*', { count: 'exact', head: true }).neq('status', 'archived'),
      supabase.from('reagents').select('*', { count: 'exact', head: true }).neq('status', 'archived').gte('last_confirmed_at', yearStart),
      supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).lte('expiry_date', soonStr).gte('expiry_date', today),
    ]
    if (student?.student_id) {
      queries.push(
        supabase.from('reagent_change_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('requested_by_student_id', student.student_id)
      )
    }
    const [{ count: total }, { count: confirmed }, { count: expiring }, myPendingRes] = await Promise.all(queries)
    setStats({
      reagents: total || 0,
      confirmedPct: total ? Math.round((confirmed || 0) / total * 100) : 0,
      expiring: expiring || 0,
      myPending: myPendingRes?.count || 0,
    })
  }

  async function fetchRecentConfirms() {
    const { data } = await supabase
      .from('reagents')
      .select('id, name, confirmed_by, last_confirmed_at, locations(room, detail)')
      .not('last_confirmed_at', 'is', null)
      .order('last_confirmed_at', { ascending: false })
      .limit(5)
    if (!data || data.length === 0) { setRecentConfirms([]); return }
    const ids = [...new Set(data.map(r => r.confirmed_by).filter(Boolean))]
    let names = {}
    if (ids.length > 0) {
      const { data: students } = await supabase.from('students').select('student_id, name').in('student_id', ids)
      students?.forEach(s => { names[s.student_id] = s.name })
    }
    setRecentConfirms(data.map(r => ({ ...r, confirmedByName: names[r.confirmed_by] || r.confirmed_by })))
  }

  function submitSearch() {
    if (!search.trim()) { navigate('/reagents/list'); return }
    navigate(`/reagents/list?q=${encodeURIComponent(search.trim())}`)
  }

  const STAT_ITEMS = [
    { label: '전체 시약', value: `${stats.reagents.toLocaleString()}개`, muted: false },
    { label: '올해 확인 완료', value: `${stats.confirmedPct}%`, muted: false, accent: C.successDark },
    { label: '유효기간 임박', value: `${stats.expiring}건`, muted: stats.expiring === 0 },
    { label: '내 수정요청 대기중', value: `${stats.myPending}건`, muted: stats.myPending === 0 },
  ]

  return (
    <div>
      <PageBanner title="연구실 시약관리 시스템" sub="Lab Dashboard" />

      <div style={{ padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* 통합 검색 */}
        <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: C.navyDeep, marginBottom: 14 }}>시약명, CAS 번호, 위치로 검색하세요</div>
          <div style={{ maxWidth: 620, margin: '0 auto', position: 'relative' }}>
            <Icon name="search" size={17} color={C.muted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitSearch()}
              placeholder="예) Acetone, 67-64-1, 303-1 A-2"
              style={{ ...inputStyle, padding: '13px 16px 13px 42px', borderRadius: 12, fontSize: 14, boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}
            />
          </div>
        </div>

        {/* 통계 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {STAT_ITEMS.map(s => (
            <div key={s.label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>
              <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: s.muted ? '#B6BCC6' : s.accent || C.navyDeep }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* 바로가기 */}
          <Card title="바로가기">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {QUICK_MENU.map(item => (
                <button key={item.to} onClick={() => navigate(item.to)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                  padding: '16px', border: `1px solid ${C.border}`, borderRadius: 10,
                  background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.blueTint; e.currentTarget.style.borderColor = 'rgba(47,107,219,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.border }}
                >
                  <Icon name={item.icon} size={22} color={C.blue} />
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.navyDeep }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: C.muted }}>{item.sub}</div>
                </button>
              ))}
            </div>
          </Card>

          {/* 최근 확인 현황 */}
          <Card title="최근 확인 현황">
            {recentConfirms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 12.5 }}>아직 확인된 시약이 없습니다</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recentConfirms.map((r, i) => {
                  const loc = r.locations
                  const isToday = r.last_confirmed_at && new Date(r.last_confirmed_at).toDateString() === new Date().toDateString()
                  return (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < recentConfirms.length - 1 ? `1px solid ${C.borderRow}` : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.navyDeep }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{loc ? `${loc.room}${loc.detail ? ' ' + loc.detail : ''}` : '위치 미지정'}</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isToday ? '오늘' : new Date(r.last_confirmed_at).toLocaleDateString('ko-KR')} · {r.confirmedByName}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
