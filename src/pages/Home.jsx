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
  const { student, isAdmin } = useOutletContext?.() || {}
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ reagents: 0, species: 0, bottles: 0, confirmedPct: 0, completedDate: null, expiring: 0, totalPending: 0 })
  const [recentConfirms, setRecentConfirms] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { fetchAll() }, [student?.student_id, isAdmin])

  async function fetchAll() {
    await Promise.all([fetchStats(), fetchRecentConfirms(), fetchPendingRequests()])
  }

  const FIELD_LABELS = {
    cas_no: 'CAS 번호', company: '제조사', category: '유별/성질', volume: '용량',
    manager: '담당자', msds_url: 'MSDS URL', notes: '비고', name: '시약명',
    sealed_count: '미개봉 병 수', current_stock: '잔량',
  }

  async function fetchPendingRequests() {
    const [{ data: changes }, { data: disposals }, { data: locs }] = await Promise.all([
      supabase.from('reagent_change_requests').select('*, reagents(name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
      supabase.from('disposal_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
      supabase.from('location_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
    ])
    const combined = [
      ...(changes || []).map(c => ({
        type: 'change', id: c.id, reagent_id: c.reagent_id, reagent_name: c.reagents?.name || '(삭제된 시약)',
        detail: `${FIELD_LABELS[c.field_name] || c.field_name}: ${c.old_value || '-'} → ${c.new_value}`,
        requested_by: c.requested_by, created_at: c.created_at, raw: c,
      })),
      ...(disposals || []).map(d => ({
        type: 'disposal', id: d.id, reagent_id: d.reagent_id, reagent_name: d.reagent_name,
        detail: `폐기 신청: ${d.reason || '-'}`,
        requested_by: d.requested_by, created_at: d.created_at, raw: d,
      })),
      ...(locs || []).map(l => ({
        type: 'location', id: l.id, reagent_id: l.reagent_id, reagent_name: l.reagent_name,
        detail: `위치 이동: ${l.from_location_name || '미지정'} → ${l.to_location_name}`,
        requested_by: l.requested_by, created_at: l.created_at, raw: l,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setPendingRequests(combined.slice(0, 8))
    setStats(prev => ({ ...prev, totalPending: combined.length }))
  }

  async function approveItem(item) {
    setBusyId(item.id)
    const now = new Date().toISOString()
    if (item.type === 'change') {
      const req = item.raw
      await supabase.from('reagents').update({ [req.field_name]: req.new_value, last_confirmed_at: now, confirmed_by: student?.student_id ?? null }).eq('id', req.reagent_id)
      await supabase.from('reagent_change_requests').update({ status: 'approved', approved_by: student?.name, approved_by_student_id: student?.student_id ?? null, approved_at: now }).eq('id', req.id)
    } else if (item.type === 'disposal') {
      const req = item.raw
      await supabase.from('disposal_requests').update({ status: 'approved', approved_by_student_id: student?.student_id ?? null }).eq('id', req.id)
      if (req.lot_id) await supabase.from('reagent_lots').update({ sealed_count: 0, current_stock: 0 }).eq('id', req.lot_id)
    } else if (item.type === 'location') {
      const req = item.raw
      await supabase.from('reagents').update({ location_id: req.to_location_id }).eq('id', req.reagent_id)
      await supabase.from('location_history').insert({
        reagent_id: req.reagent_id, reagent_name: req.reagent_name,
        from_location_id: req.from_location_id, from_location_name: req.from_location_name,
        to_location_id: req.to_location_id, to_location_name: req.to_location_name, moved_by: student?.name,
      })
      await supabase.from('location_requests').update({ status: 'approved' }).eq('id', req.id)
    }
    await fetchPendingRequests()
    setBusyId(null)
  }

  async function rejectItem(item) {
    setBusyId(item.id)
    const table = item.type === 'change' ? 'reagent_change_requests' : item.type === 'disposal' ? 'disposal_requests' : 'location_requests'
    const extra = item.type === 'change' ? { approved_by: student?.name, approved_by_student_id: student?.student_id ?? null } : {}
    await supabase.from(table).update({ status: 'rejected', ...extra }).eq('id', item.id)
    await fetchPendingRequests()
    setBusyId(null)
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
      supabase.from('reagents').select('name').neq('status', 'archived'),
      supabase.from('reagents').select('last_confirmed_at').neq('status', 'archived').gte('last_confirmed_at', yearStart).order('last_confirmed_at', { ascending: false }).limit(1),
    ]
    const [{ count: total }, { count: confirmed }, { count: expiring }, { data: allReagents }, { data: latestConfirm }] = await Promise.all(queries)
    // 같은 이름으로 등록된 병(위치별로 각각 한 행)이 여럿일 수 있어 종류 수는 별도로 센다
    const speciesSet = new Set((allReagents || []).map(r => r.name.trim().toLowerCase()))
    const confirmedPct = total ? Math.round((confirmed || 0) / total * 100) : 0
    setStats(prev => ({
      ...prev,
      reagents: total || 0,
      species: speciesSet.size,
      bottles: total || 0,
      confirmedPct,
      completedDate: confirmedPct === 100 ? latestConfirm?.[0]?.last_confirmed_at || null : null,
      expiring: expiring || 0,
    }))
  }

  async function fetchRecentConfirms() {
    const { data } = await supabase
      .from('reagents')
      .select('id, name, confirmed_by, last_confirmed_at, locations(room, detail)')
      .not('last_confirmed_at', 'is', null)
      .order('last_confirmed_at', { ascending: false })
      .limit(5)
    if (!data || data.length === 0) { setRecentConfirms([]); return }
    let names = {}
    if (isAdmin) {
      const ids = [...new Set(data.map(r => r.confirmed_by).filter(Boolean))]
      if (ids.length > 0) {
        const { data: students } = await supabase.from('students').select('student_id, name').in('student_id', ids)
        students?.forEach(s => { names[s.student_id] = s.name })
      }
    }
    setRecentConfirms(data.map(r => ({ ...r, confirmedByName: names[r.confirmed_by] || (isAdmin ? r.confirmed_by : '') })))
  }

  function submitSearch() {
    if (!search.trim()) { navigate('/reagents/list'); return }
    navigate(`/reagents/list?q=${encodeURIComponent(search.trim())}`)
  }

  const STAT_ITEMS = [
    { label: '전체 시약', value: `${stats.species.toLocaleString()}종`, sub: `총 ${stats.bottles.toLocaleString()}병`, muted: false },
    {
      label: '올해 확인 완료', value: `${stats.confirmedPct}%`, muted: false, accent: C.successDark,
      sub: stats.completedDate ? `${new Date(stats.completedDate).toLocaleDateString('ko-KR')} 완료` : undefined,
    },
    { label: '유효기간 임박', value: `${stats.expiring}건`, muted: stats.expiring === 0 },
    { label: '대기중 요청·변경사항', value: `${stats.totalPending}건`, muted: stats.totalPending === 0 },
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.muted ? '#B6BCC6' : s.accent || C.navyDeep }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: 12, color: C.muted }}>{s.sub}</div>}
              </div>
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
                        {isToday ? '오늘' : new Date(r.last_confirmed_at).toLocaleDateString('ko-KR')}{isAdmin && r.confirmedByName ? ` · ${r.confirmedByName}` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* 요청사항 · 변경사항 */}
        <Card title="요청사항 · 변경사항" titleExtra={
          pendingRequests.length > 0 && (
            <span style={{ fontSize: 11.5, color: C.muted, background: C.bg, padding: '2px 9px', borderRadius: 999, fontWeight: 600 }}>
              대기중 {stats.totalPending}건
            </span>
          )
        }>
          {pendingRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 12.5 }}>대기중인 요청·변경사항이 없습니다</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {pendingRequests.map((item, i) => {
                const typeMeta = {
                  change: { icon: '📝', label: '수정요청' },
                  disposal: { icon: '🗑️', label: '폐기신청' },
                  location: { icon: '📍', label: '위치이동' },
                }[item.type]
                const busy = busyId === item.id
                return (
                  <div key={`${item.type}_${item.id}`} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                    padding: '11px 0', borderBottom: i < pendingRequests.length - 1 ? `1px solid ${C.borderRow}` : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0, cursor: item.reagent_id ? 'pointer' : 'default' }}
                      onClick={() => item.reagent_id && navigate(`/reagents/${item.reagent_id}`)}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.navyDeep }}>
                        {typeMeta.icon} {item.reagent_name} <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>· {typeMeta.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.detail}</div>
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>
                        {new Date(item.created_at).toLocaleDateString('ko-KR')}{isAdmin && item.requested_by ? ` · ${item.requested_by}` : ''}
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => rejectItem(item)} disabled={busy} style={{
                          padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white,
                          color: C.muted, cursor: 'pointer', fontSize: 11.5, opacity: busy ? 0.5 : 1,
                        }}>반려</button>
                        <button onClick={() => approveItem(item)} disabled={busy} style={{
                          padding: '5px 10px', borderRadius: 6, border: 'none', background: C.blue,
                          color: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, opacity: busy ? 0.5 : 1,
                        }}>{busy ? '처리중...' : '승인'}</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
