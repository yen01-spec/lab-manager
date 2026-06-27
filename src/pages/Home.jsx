import { useEffect, useState, useRef } from 'react'
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
  const [labInfo, setLabInfo] = useState({ lab_professor: '', lab_assistant: '', lab_phone: '' })
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [lastUpdated, setLastUpdated] = useState('')

  useEffect(() => {
    fetchAll()
    const interval = setInterval(() => {
      setBriefings(prev => {
        if (prev.length === 0) return prev
        setCurrentBriefing(i => (i + 1) % prev.length)
        return prev
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  async function fetchAll() {
    setLastUpdated(new Date().toLocaleString('ko-KR'))
    await Promise.all([
      fetchStats(),
      fetchNotices(),
      fetchRules(),
      fetchBriefings(),
      fetchMsds(),
      fetchRecentLogs(),
      fetchLabInfo(),
    ])
  }

  async function fetchStats() {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date(); soon.setDate(soon.getDate() + 30)
    const soonStr = soon.toISOString().split('T')[0]

    const [
      { count: reagents },
      { count: items },
      { count: expiring },
      { count: lowReagents },
      { count: lowItems },
      { count: pendingPurchase },
      { count: donePurchase },
    ] = await Promise.all([
      supabase.from('reagents').select('*', { count: 'exact', head: true }),
      supabase.from('items').select('*', { count: 'exact', head: true }),
      supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).lte('expiry_date', soonStr).gte('expiry_date', today),
      supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).eq('sealed_count', 0).lte('current_stock', 10),
      supabase.from('item_lots').select('*', { count: 'exact', head: true }).eq('sealed_count', 0).lte('current_stock', 10),
      supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'done'),
    ])
    setStats({
      reagents: reagents || 0,
      items: items || 0,
      expiring: expiring || 0,
      lowStock: (lowReagents || 0) + (lowItems || 0),
      pendingPurchase: pendingPurchase || 0,
      donePurchase: donePurchase || 0,
    })
  }

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*')
      .eq('type', 'notice').order('created_at', { ascending: false }).limit(5)
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
      .eq('type', 'safety')
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) {
      const withFiles = data.filter(n => n.notice_files && n.notice_files.length > 0)
      setMsdsFiles(withFiles)
    }
  }

  async function fetchRecentLogs() {
    const { data } = await supabase.from('admin_logs').select('*')
      .order('created_at', { ascending: false }).limit(5)
    if (data) setRecentLogs(data)
  }

  async function fetchLabInfo() {
    const { data } = await supabase.from('app_settings')
      .select('key, value').in('key', ['lab_professor', 'lab_assistant', 'lab_phone'])
    if (data) {
      const info = {}
      data.forEach(d => { info[d.key] = d.value })
      setLabInfo(info)
    }
  }

  async function saveLabInfo() {
    for (const [key, value] of Object.entries(editForm)) {
      await supabase.from('app_settings').update({ value }).eq('key', key)
    }
    setLabInfo({ ...labInfo, ...editForm })
    setEditMode(false)
  }

  const briefing = briefings[currentBriefing]

  return (
    <div>
      <PageBanner title="연구실 대시보드" sub="Lab Dashboard" breadcrumb={['홈']} />

      <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 연구실 정보 배너 */}
        <div style={{
          background: C.navy, borderRadius: '10px', padding: '16px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(26,42,94,0.18)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.gold, fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>연구실 책임자</div>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                {[{ key: 'lab_professor', label: '교수님' }, { key: 'lab_assistant', label: '담당 조교' }, { key: 'lab_phone', label: '연락처' }].map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', minWidth: '70px' }}>{label}</span>
                    <input value={editForm[key] ?? labInfo[key] ?? ''} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '5px', padding: '4px 10px', color: '#fff', fontSize: '13px', width: '200px' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button onClick={saveLabInfo} style={{ background: C.gold, color: C.navy, border: 'none', padding: '5px 14px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>저장</button>
                  <button onClick={() => { setEditMode(false); setEditForm({}) }} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '5px 14px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>취소</button>
                </div>
              </div>
            ) : (
              <div style={{ color: '#fff', fontSize: '14px' }}>
                교수님: <strong>{labInfo.lab_professor || 'OOO'}</strong> 교수&nbsp;&nbsp;|&nbsp;&nbsp;
                담당 조교: <strong>{labInfo.lab_assistant || 'OOO'}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;
                연락처: <strong>{labInfo.lab_phone || '000-0000-0000'}</strong>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isSuper && !editMode && (
              <button onClick={() => { setEditMode(true); setEditForm({}) }}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>✏️ 편집</button>
            )}
            <div style={{ width: '44px', height: '44px', background: C.gold, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🔬</div>
          </div>
        </div>

        {/* 오늘의 연구실 현황 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: C.navy }}>오늘의 연구실 현황</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: C.muted }}>업데이트: {lastUpdated}</span>
              <button onClick={fetchAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: C.muted }}>↻</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
            {[
              { icon: '🧪', label: '총 시약', value: stats.reagents, sub: '전체 시약 수', color: C.navy },
              { icon: '📦', label: '총 물품', value: stats.items, sub: '전체 물품 수', color: C.navy },
              { icon: '⚠️', label: '유효기간 임박', value: stats.expiring, sub: '30일 이내', color: '#E8A020' },
              { icon: '📉', label: '재고 부족', value: stats.lowStock, sub: '10% 미만', color: '#E53E3E' },
              { icon: '🛒', label: '구매 대기', value: stats.pendingPurchase, sub: '승인 대기', color: '#667EEA' },
              { icon: '✅', label: '구매 완료', value: stats.donePurchase, sub: '승인 완료', color: '#38A169' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '16px', boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
                <div style={{ fontSize: '18px', marginBottom: '6px' }}>{s.icon}</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: s.color, lineHeight: 1 }}>{s.value.toLocaleString()}</div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: C.text, marginTop: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 빠른 메뉴 + 안전 브리핑 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* 빠른 메뉴 */}
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: C.navy, marginBottom: '12px' }}>빠른 메뉴</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {QUICK_LINKS.map(item => (
                <button key={item.to} onClick={() => navigate(item.to)} style={{
                  background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px',
                  padding: '16px', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                  boxShadow: '0 1px 4px rgba(26,42,94,0.06)', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(26,42,94,0.12)'; e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(26,42,94,0.06)'; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none' }}
                >
                  <span style={{ fontSize: '22px' }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: '10px', color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2px' }}>{item.sub}</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>{item.label}</div>
                  </div>
                  <div style={{ color: C.gold, fontSize: '14px', marginTop: 'auto' }}>→</div>
                </button>
              ))}
            </div>
          </div>

          {/* 오늘의 안전 브리핑 */}
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: C.navy, marginBottom: '12px' }}>오늘의 안전 브리핑</div>
            <div style={{
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px',
              padding: '24px', height: 'calc(100% - 36px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
            }}>
              {briefings.length === 0 ? (
                <div style={{ color: C.muted, fontSize: '13px', textAlign: 'center', margin: 'auto' }}>등록된 브리핑이 없습니다.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ fontSize: '28px' }}>📢</span>
                    <p style={{ fontSize: '14px', color: C.text, lineHeight: 1.8, margin: 0, flex: 1 }}>
                      {briefing?.content}
                    </p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {briefings.map((_, i) => (
                        <div key={i} onClick={() => setCurrentBriefing(i)} style={{
                          width: i === currentBriefing ? '16px' : '6px', height: '6px',
                          borderRadius: '3px', cursor: 'pointer',
                          background: i === currentBriefing ? C.navy : C.border,
                          transition: 'all 0.3s',
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', color: C.muted }}>{currentBriefing + 1} / {briefings.length}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 공지사항 + 최근 활동 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* 공지사항 */}
          <Card title="공지사항" sub="Notices"
            extra={<span onClick={() => navigate('/notices')} style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>전체보기 →</span>}>
            {notices.length === 0
              ? <EmptyState text="등록된 공지사항이 없습니다." />
              : notices.map((n, i) => (
                <div key={n.id} style={{
                  borderBottom: i < notices.length - 1 ? `1px solid ${C.border}` : 'none',
                  paddingBottom: i < notices.length - 1 ? '10px' : 0,
                  marginBottom: i < notices.length - 1 ? '10px' : 0,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>{n.title}</span>
                  <span style={{ fontSize: '11px', color: C.muted, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {new Date(n.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                </div>
              ))}
          </Card>

          {/* 최근 활동 */}
          <Card title="최근 활동" sub="Recent Activity"
            extra={<span onClick={() => navigate('/admin')} style={{ fontSize: '11px', color: C.muted, cursor: 'pointer' }}>더보기 →</span>}>
            {recentLogs.length === 0
              ? <EmptyState text="최근 활동이 없습니다." />
              : recentLogs.map((log, i) => (
                <div key={log.id} style={{
                  borderBottom: i < recentLogs.length - 1 ? `1px solid ${C.border}` : 'none',
                  paddingBottom: i < recentLogs.length - 1 ? '10px' : 0,
                  marginBottom: i < recentLogs.length - 1 ? '10px' : 0,
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  <span style={{ fontSize: '16px' }}>{actionIcon(log.action)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.4 }}>{log.description}</div>
                    <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>{log.admin_name}</div>
                  </div>
                  <span style={{ fontSize: '11px', color: C.muted, whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
          </Card>
        </div>

        {/* 실험실 규칙 */}
        <Card title="실험실 규칙" sub="Lab Rules"
          extra={isSuper && <button onClick={() => navigate('/admin')} style={{ fontSize: '11px', color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>편집 →</button>}>
          {rules.length === 0
            ? <EmptyState text="등록된 규칙이 없습니다." />
            : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {rules.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0' }}>
                    <span style={{
                      minWidth: '22px', height: '22px', background: C.navy, color: '#fff',
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: '700', flexShrink: 0,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: '13px', color: C.text, lineHeight: 1.5 }}>{r.content}</span>
                  </div>
                ))}
              </div>}
        </Card>

        {/* 안전 관리 자료 (MSDS) */}
        {msdsFiles.length > 0 && (
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: C.navy, marginBottom: '12px' }}>
              안전 관리 자료
            </div>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
              {msdsFiles.map(n => (
                <a key={n.id} href={n.notice_files[0]?.file_url} target="_blank" rel="noreferrer"
                  style={{
                    flexShrink: 0, width: '140px', background: '#fff',
                    border: `1px solid ${C.border}`, borderRadius: '10px', padding: '16px 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                    textDecoration: 'none', boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ width: '40px', height: '40px', background: '#FFF0F0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📄</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: C.navy, textAlign: 'center', lineHeight: 1.4, wordBreak: 'keep-all' }}>{n.title}</div>
                  <div style={{ fontSize: '10px', color: C.muted }}>{n.notice_files[0]?.file_name || 'MSDS'}</div>
                </a>
              ))}
            </div>
          </div>
        )}

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

function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: '13px' }}>{text}</div>
}
