import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, StatusBadge, inputStyle, labelStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../design'
import { exportPurchaseRequests } from '../exportUtils'

export default function Admin() {
  const { isAdmin, isSuper } = useOutletContext()
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
          {tab === 'changereq' && <ChangeRequestTab />}
          {tab === 'reagent'  && <ReagentAddTab locations={locations} />}
          {tab === 'item'     && <ItemAddTab locations={locations} />}
          {tab === 'disposal' && <DisposalTab onCountChange={fetchDisposalCount} />}
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

// ══════════════════════════════════════════════
//  시약 추가 (CAS 자동조회 포함)
// ══════════════════════════════════════════════
function ReagentAddTab({ locations }) {
  const init = {
    name: '', cas_no: '', company: '', hazard: '', category: '',
    volume: '', unit: '', location_id: '', notes: '',
    lot_no: '', expiry_date: '', received_date: ''
  }
  const [form, setForm] = useState(init)
  const [adminName, setAdminName] = useState('')
  const [casLoading, setCasLoading] = useState(false)
  const [casResult, setCasResult] = useState(null)

async function lookupCAS() {
  const cas = form.cas_no.trim()
  if (!cas) { alert('CAS 번호를 먼저 입력해주세요'); return }
  setCasLoading(true)
  setCasResult(null)

const GHS_KEY = import.meta.env.VITE_GHS_API_KEY
const MSDS_KEY = import.meta.env.VITE_MSDS_API_KEY

  try {
    let result = { iupacName: '', formula: '', hazard: '', cid: null, korName: '', msdsUrl: '', isYudok: '' }

    // 1) PubChem — 영문명, 분자식
    try {
      const cidRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/cids/JSON`)
      if (cidRes.ok) {
        const cidData = await cidRes.json()
        const cid = cidData.IdentifierList.CID[0]
        result.cid = cid
        const propRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IUPACName,MolecularFormula/JSON`)
        const propData = await propRes.json()
        const prop = propData.PropertyTable.Properties[0]
        result.iupacName = prop.IUPACName || ''
        result.formula = prop.MolecularFormula || ''
      }
    } catch {}

    // 2) 한국환경공단 GHS API — 한글명, 유독물 여부, 한글 유해성
    // 2) 한국환경공단 GHS API
try {
  const ghsRes = await fetch(
    `https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList?serviceKey=${GHS_KEY}&searchGubun=2&searchNm=${encodeURIComponent(cas)}&pageNo=1&numOfRows=1&returnType=JSON`
  )
  if (ghsRes.ok) {
    const ghsData = await ghsRes.json()
    const items = ghsData?.body?.items
    const first = Array.isArray(items) ? items[0] : items
    if (first) {
      result.korName = first.sbstnNmKor || ''
      result.isYudok = first.sbstnTypeUnqno
        ? first.sbstnTypeUnqno.split('^')[0]
        : ''
      result.hazard = first.hrmflnList
        ? first.hrmflnList.map(h => h.hrmflnClsfArtclNm).join(', ')
        : ''
    }
  }
} catch {}

    // 3) 안전보건공단 MSDS API — MSDS 링크
    try {
      const msdsRes = await fetch(
        `https://apis.data.go.kr/B552468/msdschem/getChemList?serviceKey=${MSDS_KEY}&casNo=${encodeURIComponent(cas)}&pageNo=1&numOfRows=1`
      )
      if (msdsRes.ok) {
        const text = await msdsRes.text()
        const parser = new DOMParser()
        const xml = parser.parseFromString(text, 'text/xml')
        const atchFileId = xml.querySelector('atchFileId')?.textContent
        const dataNo = xml.querySelector('dataNo')?.textContent
        if (dataNo) {
          result.msdsUrl = `https://msds.kosha.or.kr/kcic/chemicalMaterial/msdsview.do?dataNo=${dataNo}`
        }
      }
    } catch {}

    setCasResult(result)

    // 폼에 자동입력 (빈 칸만)
    setForm(prev => ({
      ...prev,
      name: prev.name || result.korName || result.iupacName,
      hazard: prev.hazard || result.hazard,
      category: prev.category || result.formula,
    }))

    // MSDS URL 자동입력
    if (result.msdsUrl && !form.notes) {
      setForm(prev => ({ ...prev, notes: prev.notes }))
    }

  } catch (err) {
    setCasResult({ error: err.message || '조회 실패' })
  } finally {
    setCasLoading(false)
  }
}

  async function addReagent() {
    if (!form.name.trim()) { alert('시약 이름을 입력해주세요'); return }
    if (!adminName.trim()) { alert('작업자 이름을 입력해주세요'); return }
    const { data: r } = await supabase.from('reagents').insert({
      name: form.name, cas_no: form.cas_no, company: form.company,
      hazard: form.hazard, category: form.category,
      volume: form.volume || null, unit: form.unit,
      location_id: form.location_id || null, notes: form.notes,
    }).select().single()
    if (r) {
      await supabase.from('reagent_lots').insert({
        reagent_id: r.id, lot_no: form.lot_no,
        sealed_count: 0, current_stock: 100,
        expiry_date: form.expiry_date || null,
        received_date: form.received_date || null,
      })
      await supabase.from('admin_logs').insert({
        admin_name: adminName, action: '시약 추가',
        target_type: 'reagent', target_id: r.id,
        description: `시약 추가: ${form.name}`,
      })
      alert('시약이 추가되었습니다!')
      setForm(init)
      setCasResult(null)
    }
  }

  return (
    <Card title="🧪 시약 추가" sub="Add Reagent">
      <div style={{ marginBottom: '20px', padding: '12px 16px',
        background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>작업자 이름 * <span style={{ color: C.muted, fontWeight: '400', textTransform: 'none' }}>(로그에 기록됩니다)</span></label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>CAS No.</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input value={form.cas_no}
              onChange={e => { setForm({ ...form, cas_no: e.target.value }); setCasResult(null) }}
              onKeyDown={e => e.key === 'Enter' && lookupCAS()}
              placeholder="예: 64-17-5"
              style={{ ...inputStyle, maxWidth: '240px' }} />
            <button onClick={lookupCAS} disabled={casLoading} style={{
              ...btnPrimary, background: '#6C63FF',
              opacity: casLoading ? 0.7 : 1, whiteSpace: 'nowrap', padding: '9px 18px',
            }}>{casLoading ? '조회 중...' : '🔍 자동완성'}</button>
          </div>
{casResult && !casResult.error && (
  <div style={{ marginTop: '10px', padding: '12px 16px',
    background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
    <div style={{ fontWeight: '700', color: '#276749', marginBottom: '8px' }}>
      ✅ 조회 성공
      <span style={{ fontSize: '11px', fontWeight: '400', color: '#52B788', marginLeft: '8px' }}>
        {casResult.korName ? '🇰🇷 국내 DB' : '🌐 PubChem'}
      </span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#2D6A4F' }}>
      {casResult.korName && <div><strong>한글명:</strong> {casResult.korName}</div>}
      {casResult.iupacName && <div><strong>IUPAC명:</strong> {casResult.iupacName}</div>}
      {casResult.formula && <div><strong>분자식:</strong> {casResult.formula}</div>}
      {casResult.hazard && <div><strong>유해성:</strong> {casResult.hazard}</div>}
      {casResult.isYudok && (
        <div>
          <span style={{ background: '#FFF5F5', color: C.danger, border: '1px solid #FC8181',
            padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
            ⚠️ {casResult.isYudok}
          </span>
        </div>
      )}
      {casResult.msdsUrl && (
        <div>
          <a href={casResult.msdsUrl} target="_blank" rel="noreferrer"
            style={{ color: C.navy, fontWeight: '600', fontSize: '12px' }}>
            📄 MSDS 바로보기 →
          </a>
        </div>
      )}
      {!casResult.korName && !casResult.iupacName && !casResult.formula && (
        <div style={{ color: '#E8A020', fontWeight: '600' }}>
          ⚠️ 일치하는 물질을 찾지 못했어요. CAS 번호를 확인해주세요.
        </div>
      )}
    </div>
    <div style={{ marginTop: '8px', fontSize: '11px', color: '#52B788' }}>
      빈 칸에 자동 입력됐어요. 직접 수정도 가능해요.
    </div>
  </div>
)}
          {casResult?.error && (
            <div style={{ marginTop: '10px', padding: '10px 14px',
              background: '#FFF5F5', border: '1px solid #FC8181',
              borderRadius: '8px', fontSize: '13px', color: C.danger }}>
              ❌ {casResult.error} — CAS 번호를 확인해주세요
            </div>
          )}
        </div>
        <div><label style={labelStyle}>시약명 *</label>
          <input value={form.name} placeholder="예: Ethanol"
            onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>회사명</label>
          <input value={form.company} placeholder="예: Sigma-Aldrich"
            onChange={e => setForm({ ...form, company: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>유해·위험성</label>
          <input value={form.hazard} placeholder="예: 인화성 액체"
            onChange={e => setForm({ ...form, hazard: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>유별/성질</label>
          <input value={form.category} placeholder="예: 액체"
            onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>용량</label>
          <input value={form.volume} placeholder="예: 500"
            onChange={e => setForm({ ...form, volume: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>단위</label>
          <input value={form.unit} placeholder="예: mL"
            onChange={e => setForm({ ...form, unit: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>Lot No.</label>
          <input value={form.lot_no}
            onChange={e => setForm({ ...form, lot_no: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>유통기한</label>
          <input type="date" value={form.expiry_date}
            onChange={e => setForm({ ...form, expiry_date: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>입고일</label>
          <input type="date" value={form.received_date}
            onChange={e => setForm({ ...form, received_date: e.target.value })} style={inputStyle} /></div>
        <div><label style={labelStyle}>위치</label>
          <select value={form.location_id}
            onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
            <option value="">선택하세요</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
          </select></div>
        <div><label style={labelStyle}>비고</label>
          <input value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></div>
      </div>
      <button onClick={addReagent} style={{ ...btnPrimary, marginTop: '20px' }}>시약 추가</button>
    </Card>
  )
}

// ══════════════════════════════════════════════
//  물품 추가
// ══════════════════════════════════════════════

function ItemAddTab({ locations }) {
  const [itemLocations, setItemLocations] = useState([])

useEffect(() => {
  supabase.from('item_locations').select('*').order('name').then(({ data }) => {
    if (data) setItemLocations(data)
  })
}, [])
  const init = { name: '', category: '', item_location_id: '', notes: '' }
  const [form, setForm] = useState(init)
  const [adminName, setAdminName] = useState('')

  async function addItem() {
    if (!form.name.trim()) { alert('물품 이름을 입력해주세요'); return }
    if (!adminName.trim()) { alert('작업자 이름을 입력해주세요'); return }
    const { data: item } = await supabase.from('items').insert({
      name: form.name, category: form.category,
      item_location_id: form.item_location_id || null, notes: form.notes,
    }).select().single()
    if (item) {
      await supabase.from('item_lots').insert({ item_id: item.id, sealed_count: 0, current_stock: 100 })
      await supabase.from('admin_logs').insert({
        admin_name: adminName, action: '물품 추가',
        target_type: 'item', target_id: item.id,
        description: `물품 추가: ${form.name}`,
      })
      alert('물품이 추가되었습니다!')
      setForm(init)
    }
  }

  return (
    <Card title="📦 물품 추가" sub="Add Item">
      <div style={{ marginBottom: '20px', padding: '12px 16px',
        background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>작업자 이름 * <span style={{ color: C.muted, fontWeight: '400', textTransform: 'none' }}>(로그에 기록됩니다)</span></label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {[['name', '물품명 *'], ['category', '물품 종류'], ['notes', '비고']].map(([key, label]) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={inputStyle} />
          </div>
        ))}
        <div><label style={labelStyle}>위치</label>
          <select value={form.item_location_id} onChange={e => setForm({ ...form, item_location_id: e.target.value })} style={inputStyle}>
  <option value="">선택하세요</option>
  {itemLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
</select></div>
      </div>
      <button onClick={addItem} style={{ ...btnPrimary, marginTop: '20px' }}>물품 추가</button>
    </Card>
  )
}

// ══════════════════════════════════════════════
//  폐기 관리
// ══════════════════════════════════════════════
function DisposalTab({ onCountChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [adminName, setAdminName] = useState('')

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('disposal_requests').select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
    onCountChange && onCountChange()
  }

  async function approve(req) {
    if (!adminName.trim()) { alert('승인자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 폐기를 승인하시겠습니까?`)) return
    await supabase.from('disposal_requests').update({
      status: 'approved', approved_by: adminName, approved_at: new Date().toISOString(),
    }).eq('id', req.id)
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '폐기 승인',
      target_type: 'disposal', target_id: req.id,
      description: `폐기 승인: ${req.reagent_name}`,
    })
    fetchRequests()
  }

  async function complete(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 폐기를 완료 처리하시겠습니까?\n⚠️ 재고에서 차감됩니다.`)) return
    if (req.lot_id) {
      const { data: lot } = await supabase.from('reagent_lots').select('*').eq('id', req.lot_id).single()
      if (lot) await supabase.from('reagent_lots').update({ sealed_count: Math.max(0, lot.sealed_count - 1) }).eq('id', req.lot_id)
    }
    await supabase.from('disposal_requests').update({ status: 'disposed', disposed_at: new Date().toISOString() }).eq('id', req.id)
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '폐기 완료',
      target_type: 'disposal', target_id: req.id,
      description: `폐기 완료: ${req.reagent_name}`,
    })
    fetchRequests()
  }

  async function reject(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 폐기 신청을 반려하시겠습니까?`)) return
    await supabase.from('disposal_requests').update({ status: 'rejected' }).eq('id', req.id)
    fetchRequests()
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, disposed: 0, rejected: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
  const statusLabel = { pending: '대기중', approved: '승인됨', disposed: '폐기완료', rejected: '반려' }
  const statusColor = { pending: '#E8A020', approved: '#667EEA', disposed: '#A0AEC0', rejected: C.danger }

  return (
    <Card title="🗑️ 폐기 관리" sub="Disposal Management">
      <div style={{ marginBottom: '20px', padding: '12px 16px',
        background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>처리자 이름 *</label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[['all','전체'],['pending','대기중'],['approved','승인됨'],['disposed','폐기완료'],['rejected','반려']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === key ? C.navy : C.bg, color: filter === key ? '#fff' : C.text,
            fontSize: '12px', fontWeight: filter === key ? '700' : '400',
          }}>{label} <span style={{ opacity: 0.7 }}>({counts[key] ?? 0})</span></button>
        ))}
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: 'center', padding: '40px', color: C.muted }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗑️</div>
            <div>폐기 신청이 없습니다</div>
          </div>
        : filtered.map(req => (
          <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', marginBottom: '10px' }}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ background: statusColor[req.status] + '22', color: statusColor[req.status],
                  fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px' }}>
                  {statusLabel[req.status]}
                </span>
                <span style={{ fontWeight: '700', fontSize: '15px', color: C.navy }}>{req.reagent_name}</span>
                <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>{new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '12px', color: C.muted, marginBottom: '10px' }}>
                <div><span style={{ fontWeight: '600' }}>신청자:</span> {req.requested_by}</div>
                <div><span style={{ fontWeight: '600' }}>수량:</span> {req.quantity}</div>
                <div><span style={{ fontWeight: '600' }}>Lot:</span> {req.lot_no || '-'}</div>
                <div><span style={{ fontWeight: '600' }}>사유:</span> {req.reason || '-'}</div>
                {req.approved_by && <div><span style={{ fontWeight: '600' }}>승인자:</span> {req.approved_by}</div>}
                {req.disposed_at && <div><span style={{ fontWeight: '600' }}>폐기일:</span> {new Date(req.disposed_at).toLocaleDateString()}</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {req.status === 'pending' && (<>
                  <button onClick={() => approve(req)} style={{ ...btnPrimary, background: '#38A169', padding: '6px 14px', fontSize: '12px' }}>✓ 승인</button>
                  <button onClick={() => reject(req)} style={{ ...btnPrimary, background: C.danger, padding: '6px 14px', fontSize: '12px' }}>✗ 반려</button>
                </>)}
                {req.status === 'approved' && (
                  <button onClick={() => complete(req)} style={{ ...btnPrimary, background: '#A0AEC0', padding: '6px 14px', fontSize: '12px' }}>🗑️ 폐기 완료</button>
                )}
              </div>
            </div>
          </div>
        ))}
    </Card>
  )
}

// ══════════════════════════════════════════════
//  위치 이동
// ══════════════════════════════════════════════
function MoveTab({ locations }) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedReagent, setSelectedReagent] = useState(null)
  const [toLocationId, setToLocationId] = useState('')
  const [movedBy, setMovedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [history, setHistory] = useState([])

  // 다량 이동용
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkLocation, setBulkLocation] = useState('')
  const [bulkSearch, setBulkSearch] = useState('')
  const [bulkResults, setBulkResults] = useState([])
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [bulkMovedBy, setBulkMovedBy] = useState('')

  // 위치 이동 신청 목록
  const [requests, setRequests] = useState([])
  const [reqFilter, setReqFilter] = useState('pending')
  const [adminName, setAdminName] = useState('')

  useEffect(() => { fetchHistory(); fetchRequests() }, [])

  async function fetchHistory() {
    const { data } = await supabase.from('location_history')
      .select('*').order('created_at', { ascending: false }).limit(30)
    if (data) setHistory(data)
  }

  async function fetchRequests() {
    const { data } = await supabase.from('location_requests')
      .select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  async function handleSearch() {
    if (!search.trim()) return
    const { data } = await supabase.from('reagents')
      .select('*, locations(*)').ilike('name', `%${search}%`)
    if (data) setSearchResults(data)
  }

  async function handleBulkSearch() {
    const { data } = await supabase.from('reagents')
      .select('*, locations(*)')
      .ilike('name', `%${bulkSearch}%`)
    if (data) setBulkResults(data)
  }

  async function moveReagent() {
    if (!selectedReagent) { alert('시약을 선택해주세요'); return }
    if (!toLocationId) { alert('이동할 위치를 선택해주세요'); return }
    if (!movedBy.trim()) { alert('이동자 이름을 입력해주세요'); return }
    if (selectedReagent.location_id === toLocationId) { alert('현재 위치와 같습니다'); return }

    const toLoc = locations.find(l => l.id === toLocationId)
    const fromLocName = selectedReagent.locations
      ? `${selectedReagent.locations.room}${selectedReagent.locations.detail ? ' - ' + selectedReagent.locations.detail : ''}`
      : '미지정'
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''

    await supabase.from('reagents').update({ location_id: toLocationId }).eq('id', selectedReagent.id)
    await supabase.from('location_history').insert({
      reagent_id: selectedReagent.id, reagent_name: selectedReagent.name,
      from_location_id: selectedReagent.location_id, from_location_name: fromLocName,
      to_location_id: toLocationId, to_location_name: toLocName,
      moved_by: movedBy, notes,
    })
    await supabase.from('admin_logs').insert({
      admin_name: movedBy, action: '위치 이동',
      target_type: 'reagent', target_id: selectedReagent.id,
      description: `${selectedReagent.name}: ${fromLocName} → ${toLocName}`,
    })
    alert(`✅ ${selectedReagent.name} 이동 완료!\n${fromLocName} → ${toLocName}`)
    setSelectedReagent(null); setToLocationId(''); setNotes('')
    setSearch(''); setSearchResults([])
    fetchHistory()
  }

  async function bulkMove() {
    if (checkedIds.size === 0) { alert('시약을 선택해주세요'); return }
    if (!bulkLocation) { alert('이동할 위치를 선택해주세요'); return }
    if (!bulkMovedBy.trim()) { alert('이동자 이름을 입력해주세요'); return }

    const toLoc = locations.find(l => l.id === bulkLocation)
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    const selected = bulkResults.filter(r => checkedIds.has(r.id))

    for (const r of selected) {
      const fromLocName = r.locations
        ? `${r.locations.room}${r.locations.detail ? ' - ' + r.locations.detail : ''}`
        : '미지정'
      await supabase.from('reagents').update({ location_id: bulkLocation }).eq('id', r.id)
      await supabase.from('location_history').insert({
        reagent_id: r.id, reagent_name: r.name,
        from_location_id: r.location_id, from_location_name: fromLocName,
        to_location_id: bulkLocation, to_location_name: toLocName,
        moved_by: bulkMovedBy,
      })
    }
    await supabase.from('admin_logs').insert({
      admin_name: bulkMovedBy, action: '다량 위치 이동',
      target_type: 'reagent', target_id: null,
      description: `${selected.length}개 시약 → ${toLocName}`,
    })
    alert(`✅ ${selected.length}개 시약 이동 완료! → ${toLocName}`)
    setCheckedIds(new Set()); setBulkLocation(''); setBulkMovedBy('')
    setBulkResults([]); setBulkSearch('')
    fetchHistory()
  }

  async function approveRequest(req) {
    if (!adminName.trim()) { alert('승인자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 위치 이동을 승인하시겠습니까?\n${req.from_location_name} → ${req.to_location_name}`)) return

    await supabase.from('reagents').update({ location_id: req.to_location_id }).eq('id', req.reagent_id)
    await supabase.from('location_requests').update({
      status: 'approved', approved_by: adminName, approved_at: new Date().toISOString(),
    }).eq('id', req.id)
    await supabase.from('location_history').insert({
      reagent_id: req.reagent_id, reagent_name: req.reagent_name,
      from_location_id: req.from_location_id, from_location_name: req.from_location_name,
      to_location_id: req.to_location_id, to_location_name: req.to_location_name,
      moved_by: adminName, notes: `신청자: ${req.requested_by}`,
    })
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '위치 이동 승인',
      target_type: 'reagent', target_id: req.reagent_id,
      description: `${req.reagent_name}: ${req.from_location_name} → ${req.to_location_name}`,
    })
    fetchRequests(); fetchHistory()
  }

  async function rejectRequest(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 위치 이동 신청을 반려하시겠습니까?`)) return
    await supabase.from('location_requests').update({ status: 'rejected' }).eq('id', req.id)
    fetchRequests()
  }

  const toggleCheck = (id) => {
    const next = new Set(checkedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setCheckedIds(next)
  }

  const toggleAll = () => {
    if (checkedIds.size === bulkResults.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(bulkResults.map(r => r.id)))
  }

  const filteredReqs = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)
  const reqCounts = { all: requests.length, pending: 0, approved: 0, rejected: 0 }
  requests.forEach(r => { if (reqCounts[r.status] !== undefined) reqCounts[r.status]++ })
  const statusColor = { pending: '#E8A020', approved: '#38A169', rejected: C.danger }
  const statusLabel = { pending: '대기중', approved: '승인됨', rejected: '반려' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* 위치 이동 신청 목록 */}
      <Card title="📬 위치 이동 신청 목록" sub="학생 신청 승인/반려">
        <div style={{ marginBottom: '16px', padding: '12px 16px',
          background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
          <label style={labelStyle}>처리자 이름 *</label>
          <input value={adminName} onChange={e => setAdminName(e.target.value)}
            placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[['all','전체'],['pending','대기중'],['approved','승인됨'],['rejected','반려']].map(([key, label]) => (
            <button key={key} onClick={() => setReqFilter(key)} style={{
              padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              background: reqFilter === key ? C.navy : C.bg,
              color: reqFilter === key ? '#fff' : C.text,
              fontSize: '12px', fontWeight: reqFilter === key ? '700' : '400',
            }}>{label} <span style={{ opacity: 0.7 }}>({reqCounts[key] ?? 0})</span></button>
          ))}
        </div>
        {filteredReqs.length === 0
          ? <div style={{ textAlign: 'center', padding: '24px', color: C.muted, fontSize: '13px' }}>신청 내역이 없습니다</div>
          : filteredReqs.map(req => (
            <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ background: statusColor[req.status] + '22', color: statusColor[req.status],
                  fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>
                  {statusLabel[req.status]}
                </span>
                <span style={{ fontWeight: '700', color: C.navy }}>{req.reagent_name}</span>
                <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>{req.requested_by} · {new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '8px' }}>
                {req.from_location_name || '미지정'} → <strong style={{ color: '#276749' }}>{req.to_location_name}</strong>
                {req.notes && <span style={{ marginLeft: '8px' }}>({req.notes})</span>}
              </div>
              {req.status === 'pending' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => approveRequest(req)}
                    style={{ ...btnPrimary, background: '#38A169', padding: '5px 14px', fontSize: '12px' }}>✓ 승인</button>
                  <button onClick={() => rejectRequest(req)}
                    style={{ ...btnPrimary, background: C.danger, padding: '5px 14px', fontSize: '12px' }}>✗ 반려</button>
                </div>
              )}
              {req.approved_by && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>승인자: {req.approved_by}</div>}
            </div>
          ))}
      </Card>

      {/* 모드 전환 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => setBulkMode(false)} style={{
          ...btnPrimary, background: !bulkMode ? C.navy : C.bg,
          color: !bulkMode ? '#fff' : C.text, border: `1px solid ${C.border}`,
        }}>📍 단일 이동</button>
        <button onClick={() => setBulkMode(true)} style={{
          ...btnPrimary, background: bulkMode ? C.navy : C.bg,
          color: bulkMode ? '#fff' : C.text, border: `1px solid ${C.border}`,
        }}>📋 다량 이동</button>
      </div>

      {/* 단일 이동 */}
      {!bulkMode && (
        <Card title="📍 단일 시약 이동" sub="Single Move">
          <div style={{ marginBottom: '20px', padding: '12px 16px',
            background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
            <label style={labelStyle}>이동자 이름 *</label>
            <input value={movedBy} onChange={e => setMovedBy(e.target.value)}
              placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>시약 검색 *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={search}
                onChange={e => { setSearch(e.target.value); setSelectedReagent(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="시약 이름으로 검색..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={handleSearch} style={{ ...btnPrimary, padding: '9px 18px', flexShrink: 0 }}>검색</button>
            </div>
          </div>
          {searchResults.length > 0 && !selectedReagent && (
            <div style={{ marginBottom: '16px', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
              {searchResults.map(r => (
                <div key={r.id} onClick={() => { setSelectedReagent(r); setSearchResults([]) }}
                  style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = C.white}>
                  <span style={{ fontWeight: '600', color: C.navy }}>{r.name}</span>
                  <span style={{ color: C.muted, marginLeft: '12px', fontSize: '12px' }}>
                    현재: {r.locations ? `${r.locations.room}${r.locations.detail ? ' - ' + r.locations.detail : ''}` : '미지정'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {selectedReagent && (
            <div style={{ marginBottom: '16px', padding: '12px 16px',
              background: '#EEF2FB', borderRadius: '8px', border: `1px solid ${C.navy}33`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '700', color: C.navy }}>{selectedReagent.name}</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                  현재: {selectedReagent.locations ? `${selectedReagent.locations.room}${selectedReagent.locations.detail ? ' - ' + selectedReagent.locations.detail : ''}` : '미지정'}
                </div>
              </div>
              <button onClick={() => setSelectedReagent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
          )}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>이동할 위치 *</label>
            <select value={toLocationId} onChange={e => setToLocationId(e.target.value)} style={inputStyle}>
              <option value="">선택하세요</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>메모</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="선택사항" style={inputStyle} />
          </div>
          {selectedReagent && toLocationId && (
            <div style={{ marginBottom: '16px', padding: '10px 14px',
              background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
              <strong style={{ color: '#276749' }}>이동 미리보기:</strong>
              <div style={{ marginTop: '4px', color: '#2D6A4F' }}>
                {selectedReagent.locations ? `${selectedReagent.locations.room}${selectedReagent.locations.detail ? ' - ' + selectedReagent.locations.detail : ''}` : '미지정'}
                {' → '}
                {(() => { const l = locations.find(l => l.id === toLocationId); return l ? `${l.room}${l.detail ? ' - ' + l.detail : ''}` : '' })()}
              </div>
            </div>
          )}
          <button onClick={moveReagent} style={{ ...btnPrimary, background: '#667EEA' }}>📍 위치 이동</button>
        </Card>
      )}

      {/* 다량 이동 */}
      {bulkMode && (
        <Card title="📋 다량 시약 이동" sub="Bulk Move">
          <div style={{ marginBottom: '20px', padding: '12px 16px',
            background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
            <label style={labelStyle}>이동자 이름 *</label>
            <input value={bulkMovedBy} onChange={e => setBulkMovedBy(e.target.value)}
              placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>시약 검색</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBulkSearch()}
                  placeholder="이름 검색 (빈칸=전체)"
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={handleBulkSearch} style={{ ...btnPrimary, padding: '9px 14px', flexShrink: 0 }}>검색</button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>이동할 위치 *</label>
              <select value={bulkLocation} onChange={e => setBulkLocation(e.target.value)} style={inputStyle}>
                <option value="">선택하세요</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
              </select>
            </div>
          </div>

          {bulkResults.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: C.muted }}>
                  <strong style={{ color: C.navy }}>{checkedIds.size}개</strong> 선택됨 / 총 {bulkResults.length}개
                </div>
                <button onClick={toggleAll} style={{ ...btnGhost, padding: '4px 12px', fontSize: '12px' }}>
                  {checkedIds.size === bulkResults.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', maxHeight: '300px', overflowY: 'auto' }}>
                {bulkResults.map(r => (
                  <div key={r.id} onClick={() => toggleCheck(r.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
                      background: checkedIds.has(r.id) ? '#EEF2FB' : C.white,
                    }}
                    onMouseEnter={e => { if (!checkedIds.has(r.id)) e.currentTarget.style.background = C.bg }}
                    onMouseLeave={e => { if (!checkedIds.has(r.id)) e.currentTarget.style.background = C.white }}>
                    <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => {}} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: '600', color: C.navy, fontSize: '13px' }}>{r.name}</span>
                      <span style={{ color: C.muted, fontSize: '12px', marginLeft: '12px' }}>
                        {r.locations ? `${r.locations.room}${r.locations.detail ? ' - ' + r.locations.detail : ''}` : '미지정'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {checkedIds.size > 0 && bulkLocation && (
            <div style={{ marginBottom: '16px', padding: '10px 14px',
              background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
              <strong style={{ color: '#276749' }}>이동 미리보기:</strong>
              <div style={{ marginTop: '4px', color: '#2D6A4F' }}>
                선택된 {checkedIds.size}개 시약 →{' '}
                {(() => { const l = locations.find(l => l.id === bulkLocation); return l ? `${l.room}${l.detail ? ' - ' + l.detail : ''}` : '' })()}
              </div>
            </div>
          )}

          <button onClick={bulkMove} style={{ ...btnPrimary, background: '#667EEA' }}>
            📋 {checkedIds.size > 0 ? `${checkedIds.size}개 ` : ''}일괄 이동
          </button>
        </Card>
      )}

      {/* 이동 이력 */}
      <Card title="📋 위치 이동 이력" noPadding>
        {history.length === 0
          ? <div style={{ padding: '24px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>이동 이력이 없습니다</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['일시','시약명','이전 위치','새 위치','이동자','메모'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={{ ...tdStyle, color: C.muted, fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{h.reagent_name}</td>
                    <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{h.from_location_name || '미지정'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}><span style={{ color: '#276749', fontWeight: '600' }}>{h.to_location_name}</span></td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{h.moved_by}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{h.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════
//  공지 / 안전정보
// ══════════════════════════════════════════════
function NoticeTab() {
  const [form, setForm] = useState({ title: '', content: '', type: 'notice' })
  const [notices, setNotices] = useState([])
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false })
    if (data) setNotices(data)
  }

  async function save() {
    if (!form.title.trim()) { alert('제목을 입력해주세요'); return }
    if (editTarget) {
      await supabase.from('notices').update({ title: form.title, content: form.content, type: form.type }).eq('id', editTarget)
    } else {
      await supabase.from('notices').insert(form)
    }
    setForm({ title: '', content: '', type: 'notice' })
    setEditTarget(null)
    fetchNotices()
  }

  async function del(id) {
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchNotices()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title={editTarget ? '✏️ 수정 중' : '📢 새 글 작성'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '16px', marginBottom: '12px' }}>
          <div><label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>분류</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              <option value="notice">공지사항</option>
              <option value="safety">안전관리</option>
            </select></div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>내용</label>
          <textarea value={form.content} rows={4}
            onChange={e => setForm({ ...form, content: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} style={btnPrimary}>{editTarget ? '수정 저장' : '등록'}</button>
          {editTarget && <button onClick={() => { setEditTarget(null); setForm({ title: '', content: '', type: 'notice' }) }} style={btnGhost}>취소</button>}
        </div>
      </Card>
      <Card title="📋 등록된 글 목록">
        {notices.length === 0 ? <p style={{ color: C.muted }}>등록된 글이 없습니다.</p>
          : notices.map(n => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px',
                    background: n.type === 'safety' ? '#FEF3C7' : '#EBF8FF',
                    color: n.type === 'safety' ? '#92400E' : '#1A56DB',
                    padding: '1px 8px', borderRadius: '10px', fontWeight: '700' }}>
                    {n.type === 'safety' ? '안전관리' : '공지'}
                  </span>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{n.title}</span>
                  <span style={{ color: C.muted, fontSize: '12px' }}>{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
                {n.content && <p style={{ margin: 0, color: C.muted, fontSize: '13px' }}>{n.content}</p>}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                <button onClick={() => { setEditTarget(n.id); setForm({ title: n.title, content: n.content || '', type: n.type || 'notice' }) }}
                  style={{ ...btnGhost, padding: '4px 10px', fontSize: '12px' }}>수정</button>
                <button onClick={() => del(n.id)} style={{ background: '#FFF5F5', color: C.danger,
                  border: `1px solid #FC8181`, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
              </div>
            </div>
          ))}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════
//  구매 관리
// ══════════════════════════════════════════════
function PurchaseTab({ onCountChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('all')
  const [rejectNote, setRejectNote] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [trackingInputs, setTrackingInputs] = useState({})

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('purchase_requests').select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
    onCountChange && onCountChange()
  }

  async function updateStatus(id, status, note) {
    const tracking = trackingInputs[id] || {}
    await supabase.from('purchase_requests').update({
      status,
      ...(note ? { reject_note: note } : {}),
      ...(status === 'ordered' ? { ordered_at: new Date().toISOString(), tracking_number: tracking.tracking_number || null, estimated_arrival: tracking.estimated_arrival || null } : {}),
      ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    fetchRequests()
  }

  async function saveTracking(id) {
    const tracking = trackingInputs[id] || {}
    await supabase.from('purchase_requests').update({
      tracking_number: tracking.tracking_number || null,
      estimated_arrival: tracking.estimated_arrival || null,
    }).eq('id', id)
    alert('저장되었습니다!')
    fetchRequests()
  }

  function setTracking(id, field, value) {
    setTrackingInputs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, ordered: 0, delivered: 0, rejected: 0, done: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
  const filterTabs = [
    { key: 'all', label: '전체' }, { key: 'pending', label: '대기중' }, { key: 'approved', label: '승인됨' },
    { key: 'ordered', label: '발주완료' }, { key: 'delivered', label: '배송완료' }, { key: 'done', label: '완료' }, { key: 'rejected', label: '반려' },
  ]

  return (
    <Card title="🛒 구매 요청 관리" sub="Purchase Management"
      extra={requests.length > 0 && (
        <button onClick={() => exportPurchaseRequests(filtered)} style={{
          background: '#1D6F42', color: 'white', border: 'none',
          padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
        }}>📥 엑셀</button>
      )}>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {filterTabs.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === f.key ? C.navy : C.bg, color: filter === f.key ? '#fff' : C.text,
            fontSize: '12px', fontWeight: filter === f.key ? '700' : '400',
          }}>{f.label} <span style={{ opacity: 0.7 }}>({counts[f.key] ?? 0})</span></button>
        ))}
      </div>
      {filtered.length === 0 ? <p style={{ color: C.muted }}>해당하는 요청이 없습니다.</p>
        : filtered.map(req => (
          <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '8px', marginBottom: '10px', overflow: 'hidden' }}>
            <div onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer', background: '#fff' }}>
              <StatusBadge status={req.status} />
              <span style={{ fontWeight: '600', flex: 1 }}>{req.target_name || `(ID: ${req.target_id})`}</span>
              <span style={{ color: C.muted, fontSize: '13px' }}>{req.user_name}</span>
              <span style={{ color: C.muted, fontSize: '12px' }}>{new Date(req.created_at).toLocaleDateString()}</span>
              <span style={{ color: C.muted, fontSize: '12px' }}>{expandedId === req.id ? '▲' : '▼'}</span>
            </div>
            {expandedId === req.id && (
              <div style={{ padding: '16px', background: C.bg, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  {[
                    ['종류', req.target_type === 'reagent' ? '시약' : req.target_type === 'item' ? '물품' : '신규'],
                    ['수량', req.quantity], ['요청 사유', req.reason || '-'],
                    req.reject_note && ['반려 사유', req.reject_note],
                    req.ordered_at && ['발주일', new Date(req.ordered_at).toLocaleDateString()],
                    req.tracking_number && ['운송장 번호', req.tracking_number],
                    req.estimated_arrival && ['예상 도착일', req.estimated_arrival],
                    req.delivered_at && ['배송완료일', new Date(req.delivered_at).toLocaleDateString()],
                  ].filter(Boolean).map(([label, value]) => (
                    <div key={label}>
                      <span style={{ fontSize: '11px', color: C.muted, marginRight: '6px' }}>{label}:</span>
                      <span style={{ fontSize: '13px' }}>{value}</span>
                    </div>
                  ))}
                </div>
                {(req.status === 'approved' || req.status === 'ordered') && (
                  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>배송 정보 입력</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>운송장 번호</label>
                        <input placeholder={req.tracking_number || '예: 1234567890'}
                          value={trackingInputs[req.id]?.tracking_number ?? req.tracking_number ?? ''}
                          onChange={e => setTracking(req.id, 'tracking_number', e.target.value)}
                          style={{ ...inputStyle, fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>예상 도착일</label>
                        <input type="date"
                          value={trackingInputs[req.id]?.estimated_arrival ?? req.estimated_arrival ?? ''}
                          onChange={e => setTracking(req.id, 'estimated_arrival', e.target.value)}
                          style={{ ...inputStyle, fontSize: '13px' }} />
                      </div>
                    </div>
                    <button onClick={() => saveTracking(req.id)} style={{ marginTop: '8px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '5px 14px', cursor: 'pointer', fontSize: '12px', color: C.text }}>저장</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {req.status === 'pending' && (<>
                    <button onClick={() => updateStatus(req.id, 'approved')} style={{ ...btnPrimary, background: '#38A169' }}>✓ 승인</button>
                    <input placeholder="반려 사유" value={rejectNote[req.id] || ''}
                      onChange={e => setRejectNote({ ...rejectNote, [req.id]: e.target.value })}
                      style={{ ...inputStyle, width: '200px' }} />
                    <button onClick={() => updateStatus(req.id, 'rejected', rejectNote[req.id])} style={{ ...btnPrimary, background: C.danger }}>✗ 반려</button>
                  </>)}
                  {req.status === 'approved' && <button onClick={() => updateStatus(req.id, 'ordered')} style={{ ...btnPrimary, background: '#667EEA' }}>📦 발주 완료</button>}
                  {req.status === 'ordered' && <button onClick={() => updateStatus(req.id, 'delivered')} style={{ ...btnPrimary, background: '#38A169' }}>🚚 배송 완료</button>}
                  {req.status === 'delivered' && <button onClick={() => updateStatus(req.id, 'done')} style={{ ...btnPrimary, background: '#A0AEC0' }}>✓ 완료 처리</button>}
                </div>
              </div>
            )}
          </div>
        ))}
    </Card>
  )
}

// ══════════════════════════════════════════════
//  영수증 관리
// ══════════════════════════════════════════════
function ReceiptTab() {
  const [receipts, setReceipts] = useState([])
  const [form, setForm] = useState({ title: '', doc_type: 'receipt', date: '', notes: '', file_url: '' })
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  useEffect(() => { fetchReceipts() }, [])

  async function fetchReceipts() {
    const { data } = await supabase.from('receipts').select('*').order('date', { ascending: false })
    if (data) setReceipts(data)
  }

  async function upload() {
    if (!form.title.trim()) { alert('제목을 입력해주세요'); return }
    if (!form.date) { alert('날짜를 입력해주세요'); return }
    setUploading(true)
    let fileUrl = ''
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()
      const fileName = `receipts/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(fileName, selectedFile)
      if (error) { alert('파일 업로드 실패: ' + error.message); setUploading(false); return }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
      fileUrl = urlData?.publicUrl || ''
    }
    await supabase.from('receipts').insert({
      title: form.title, doc_type: form.doc_type, date: form.date, notes: form.notes,
      file_url: fileUrl || form.file_url || null,
    })
    alert('등록되었습니다!')
    setForm({ title: '', doc_type: 'receipt', date: '', notes: '', file_url: '' })
    setSelectedFile(null)
    setUploading(false)
    fetchReceipts()
  }

  async function del(id) {
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('receipts').delete().eq('id', id)
    fetchReceipts()
  }

  const typeLabel = { receipt: '영수증', estimate: '견적서', statement: '거래명세서', other: '기타' }
  const typeColor = { receipt: '#38A169', estimate: '#667EEA', statement: '#E8A020', other: '#A0AEC0' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title="🧾 서류 등록">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div><label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: Ethanol 구매 영수증" style={inputStyle} /></div>
          <div><label style={labelStyle}>서류 종류</label>
            <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} style={inputStyle}>
              <option value="receipt">영수증</option><option value="estimate">견적서</option>
              <option value="statement">거래명세서</option><option value="other">기타</option>
            </select></div>
          <div><label style={labelStyle}>날짜 *</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>비고</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>파일 첨부 (이미지/PDF)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setSelectedFile(e.target.files[0])} style={{ ...inputStyle, padding: '6px' }} />
            {selectedFile && <p style={{ margin: '4px 0 0', fontSize: '12px', color: C.muted }}>선택됨: {selectedFile.name}</p>}
            <label style={{ ...labelStyle, marginTop: '8px' }}>또는 URL 직접 입력</label>
            <input value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." style={inputStyle} />
          </div>
        </div>
        <button onClick={upload} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중...' : '등록'}
        </button>
      </Card>
      <Card title="📁 서류 목록" noPadding>
        {receipts.length === 0 ? <p style={{ padding: '20px', color: C.muted }}>등록된 서류가 없습니다.</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['날짜','종류','제목','비고','파일','삭제'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{receipts.map(r => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.date}</td>
                  <td style={tdStyle}><span style={{ background: typeColor[r.doc_type] + '22', color: typeColor[r.doc_type], padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>{typeLabel[r.doc_type]}</span></td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{r.title}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{r.notes || '-'}</td>
                  <td style={tdStyle}>{r.file_url ? <a href={r.file_url} target="_blank" rel="noreferrer" style={{ color: C.navy, fontSize: '13px' }}>📎 보기</a> : <span style={{ color: C.muted, fontSize: '12px' }}>없음</span>}</td>
                  <td style={tdStyle}><button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer' }}>✕</button></td>
                </tr>
              ))}</tbody>
            </table>}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════
//  관리 탭
// ══════════════════════════════════════════════
function ManageTab() {
  const [expiring, setExpiring] = useState([])
  const [lowReagents, setLowReagents] = useState([])
  const [lowItems, setLowItems] = useState([])
  const [days, setDays] = useState(30)

  useEffect(() => { fetchAll() }, [days])

  async function fetchAll() {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date(); soon.setDate(soon.getDate() + days)
    const soonStr = soon.toISOString().split('T')[0]
    const { data: exp } = await supabase.from('reagent_lots')
      .select('*, reagents(name, locations(room, detail))')
      .lte('expiry_date', soonStr).gte('expiry_date', today).order('expiry_date')
    if (exp) setExpiring(exp)
    const { data: rLow } = await supabase.from('reagent_lots').select('*, reagents(name)').eq('sealed_count', 0).lte('current_stock', 20)
    if (rLow) setLowReagents(rLow)
    const { data: iLow } = await supabase.from('item_lots').select('*, items(name)').eq('sealed_count', 0).lte('current_stock', 20)
    if (iLow) setLowItems(iLow)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title={`⏰ 유통기한 임박 (${days}일 이내)`}
        extra={<div style={{ display: 'flex', gap: '6px' }}>
          {[14,30,60,90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '12px', background: days === d ? C.navy : C.bg, color: days === d ? '#fff' : C.text }}>{d}일</button>
          ))}
        </div>}>
        {expiring.length === 0 ? <p style={{ color: C.muted }}>해당 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명','위치','Lot No.','유통기한','D-day'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{expiring.map(lot => {
                const dday = Math.ceil((new Date(lot.expiry_date) - new Date()) / 86400000)
                return <tr key={lot.id}>
                  <td style={tdStyle}>{lot.reagents?.name}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{lot.reagents?.locations?.room}{lot.reagents?.locations?.detail ? ' - ' + lot.reagents.locations.detail : ''}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{lot.lot_no || '-'}</td>
                  <td style={tdStyle}>{lot.expiry_date}</td>
                  <td style={{ ...tdStyle, color: dday <= 7 ? C.danger : C.warning, fontWeight: '700' }}>D-{dday}</td>
                </tr>
              })}</tbody>
            </table>}
      </Card>
      <Card title="⚠️ 재고 부족 시약">
        {lowReagents.length === 0 ? <p style={{ color: C.muted }}>재고 부족 시약 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명','Lot No.','미개봉','잔량'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{lowReagents.map(lot => (
                <tr key={lot.id} style={{ background: '#FFF8F8' }}>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{lot.reagents?.name}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{lot.lot_no || '-'}</td>
                  <td style={tdStyle}>{lot.sealed_count}병</td>
                  <td style={{ ...tdStyle, color: C.danger, fontWeight: '700' }}>{lot.current_stock}%</td>
                </tr>
              ))}</tbody>
            </table>}
      </Card>
      <Card title="⚠️ 재고 부족 물품">
        {lowItems.length === 0 ? <p style={{ color: C.muted }}>재고 부족 물품 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['물품명','미개봉','잔량'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{lowItems.map(lot => (
                <tr key={lot.id} style={{ background: '#FFF8F8' }}>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{lot.items?.name}</td>
                  <td style={tdStyle}>{lot.sealed_count}개</td>
                  <td style={{ ...tdStyle, color: C.danger, fontWeight: '700' }}>{lot.current_stock}%</td>
                </tr>
              ))}</tbody>
            </table>}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════
//  로그
// ══════════════════════════════════════════════
function LogTab() {
  const [logs, setLogs] = useState([])
  const [stockLogs, setStockLogs] = useState([])
  const [logTab, setLogTab] = useState('admin')

  useEffect(() => { fetchLogs() }, [logTab])

  async function fetchLogs() {
    if (logTab === 'admin') {
      const { data } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(100)
      if (data) setLogs(data)
    } else {
      const { data } = await supabase.from('stock_logs').select('*, reagent_lots(lot_no, reagents(name))').order('created_at', { ascending: false }).limit(100)
      if (data) setStockLogs(data)
    }
  }

  return (
    <Card title="📋 변경 로그" sub="Change Logs">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[['admin','관리자 작업 로그'],['stock','재고 수정 로그']].map(([key, label]) => (
          <button key={key} onClick={() => setLogTab(key)} style={{
            ...btnGhost, background: logTab === key ? C.navy : '#fff',
            color: logTab === key ? '#fff' : C.text, border: `1px solid ${logTab === key ? C.navy : C.border}`,
          }}>{label}</button>
        ))}
      </div>
      {logTab === 'admin' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['일시','작업자','작업','대상','내용'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {logs.length === 0
              ? <tr><td colSpan={5} style={{ padding: '20px', color: C.muted, textAlign: 'center' }}>로그가 없습니다</td></tr>
              : logs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.admin_name}</td>
                  <td style={tdStyle}><span style={{ background: '#EBF8FF', color: '#2B6CB0', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{l.action}</span></td>
                  <td style={{ ...tdStyle, color: C.muted }}>{l.target_type}</td>
                  <td style={tdStyle}>{l.description}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {logTab === 'stock' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['일시','작업자','시약','Lot','미개봉 변경','잔량 변경'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {stockLogs.length === 0
              ? <tr><td colSpan={6} style={{ padding: '20px', color: C.muted, textAlign: 'center' }}>로그가 없습니다</td></tr>
              : stockLogs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.user_name}</td>
                  <td style={tdStyle}>{l.reagent_lots?.reagents?.name || '-'}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{l.reagent_lots?.lot_no || '-'}</td>
                  <td style={tdStyle}>{l.before_sealed} → <strong>{l.after_sealed}</strong></td>
                  <td style={tdStyle}>{l.before_stock}% → <strong>{l.after_stock}%</strong></td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
// ══════════════════════════════════════════════
//  정보 일괄 갱신
// ══════════════════════════════════════════════
function BulkUpdateTab() {
  const [reagents, setReagents] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, done: false })
  const [results, setResults] = useState([])
  const [filter, setFilter] = useState('all') // all, empty

const GHS_KEY = import.meta.env.VITE_GHS_API_KEY

useEffect(() => { fetchReagents() }, [filter])

  async function fetchReagents() {
  let query = supabase.from('reagents')
  .select('id, name, cas_no, hazard', { count: 'exact' })
  .order('name')
if (filter === 'empty') query = query.is('hazard', null)
query = query.range(0, 4999)
const { data, count } = await query
if (count > 4999) {
  alert(`⚠️ 시약이 ${count}개로 많아 일부만 표시됩니다.`)
}
if (data) setReagents(data)
}

  async function runBulkUpdate() {
  const targets = reagents.filter(r => r.cas_no || r.name)
  if (targets.length === 0) { alert('시약이 없습니다'); return }
  if (!window.confirm(`${targets.length}개 시약을 일괄 업데이트하시겠습니까?\n시간이 걸릴 수 있어요.`)) return

  setLoading(true)
  setProgress({ current: 0, total: targets.length, done: false })
  setResults([])

  const newResults = []
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i]
    setProgress({ current: i + 1, total: targets.length, done: false })
    try {
      let casNo = r.cas_no
      let foundByCas = false
      let foundByName = false

      // CAS 없으면 시약명으로 PubChem에서 CAS 조회
      if (!casNo && r.name) {
        try {
          const cidRes = await fetch(
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(r.name)}/property/IUPACName,MolecularFormula/JSON`
          )
          if (cidRes.ok) {
            // CAS 번호 조회
            const synRes = await fetch(
              `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(r.name)}/synonyms/JSON`
            )
            if (synRes.ok) {
              const synData = await synRes.json()
              const synonyms = synData?.InformationList?.Information?.[0]?.Synonym || []
              const casPattern = /^\d{2,7}-\d{2}-\d$/
              casNo = synonyms.find(s => casPattern.test(s)) || null
              if (casNo) foundByName = true
            }
          }
        } catch {}
      } else if (casNo) {
        foundByCas = true
      }

      // CAS 번호로 GHS API 조회
      if (casNo) {
        const ghsRes = await fetch(
          `https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList?serviceKey=${GHS_KEY}&searchGubun=2&searchNm=${encodeURIComponent(casNo)}&pageNo=1&numOfRows=1&returnType=JSON`
        )
        if (ghsRes.ok) {
          const ghsData = await ghsRes.json()
          const items = ghsData?.body?.items
          const first = Array.isArray(items) ? items[0] : items
          if (first) {
            const korName = first.sbstnNmKor || ''
            const hazard = first.hrmflnList
              ? first.hrmflnList.map(h => h.hrmflnClsfArtclNm).join(', ')
              : ''
            const isYudok = first.sbstnTypeUnqno ? first.sbstnTypeUnqno.split('^')[0] : ''

            // DB 업데이트
            const updateData = {
              hazard: hazard || r.hazard,
              data_source: 'ghs_api',
            }
            if (!r.cas_no && casNo) updateData.cas_no = casNo
            if (!r.name && korName) updateData.name = korName

            await supabase.from('reagents').update(updateData).eq('id', r.id)

            newResults.push({
              name: r.name, cas_no: casNo, korName, hazard, isYudok,
              source: foundByName ? '시약명→CAS→GHS' : 'CAS→GHS',
              status: 'success'
            })
          } else {
            // GHS DB에 없지만 CAS는 찾음
            if (foundByName && casNo) {
              await supabase.from('reagents').update({
                cas_no: casNo, data_source: 'pubchem'
              }).eq('id', r.id)
            }
            newResults.push({ name: r.name, cas_no: casNo, status: 'notfound', source: foundByName ? '시약명→CAS' : 'CAS만' })
          }
        }
      } else {
        newResults.push({ name: r.name, cas_no: null, status: 'nocas', source: '-' })
      }
    } catch {
      newResults.push({ name: r.name, cas_no: r.cas_no, status: 'error', source: '-' })
    }
    setResults([...newResults])
    await new Promise(res => setTimeout(res, 500))
  }
  setProgress(prev => ({ ...prev, done: true }))
  setLoading(false)
}

  const successCount = results.filter(r => r.status === 'success').length
  const notFoundCount = results.filter(r => r.status === 'notfound').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title="🔄 시약 정보 일괄 갱신" sub="Bulk Update">
        <div style={{ marginBottom: '16px', padding: '12px 16px',
          background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', fontSize: '13px' }}>
          ⚠️ CAS 번호가 등록된 시약의 <strong>유해성 정보</strong>를 한국환경공단 GHS API로 일괄 업데이트해요.
          API 제한으로 시약 1개당 0.5초 소요됩니다.
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[['all','전체'], ['empty','유해성 없는 것만']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '6px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              background: filter === key ? C.navy : C.bg,
              color: filter === key ? '#fff' : C.text,
              fontSize: '12px', fontWeight: filter === key ? '700' : '400',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ marginBottom: '16px', fontSize: '13px', color: C.muted }}>
          CAS 번호 있는 시약: <strong style={{ color: C.navy }}>{reagents.filter(r => r.cas_no).length}개</strong>
          {' / '}전체: {reagents.length}개
        </div>

        {/* 진행 상황 */}
        {loading && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
              <span>진행 중... ({progress.current}/{progress.total})</span>
              <span>{Math.round(progress.current / progress.total * 100)}%</span>
            </div>
            <div style={{ background: C.bg, borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
              <div style={{
                background: C.navy, height: '100%', borderRadius: '8px',
                width: `${progress.current / progress.total * 100}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {progress.done && (
          <div style={{ marginBottom: '16px', padding: '12px 16px',
            background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
            ✅ 완료! 성공 <strong>{successCount}개</strong> / 미등록 <strong>{notFoundCount}개</strong>
          </div>
        )}

        <button onClick={runBulkUpdate} disabled={loading} style={{
          ...btnPrimary, background: '#667EEA',
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? `갱신 중... (${progress.current}/${progress.total})` : '🔄 일괄 갱신 시작'}
        </button>
      </Card>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <Card title="📋 갱신 결과" noPadding>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['시약명', 'CAS No.', '한글명', '유해성', '출처', '결과'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.name}</td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.cas_no}</td>
                  <td style={{ ...tdStyle, fontSize: '12px' }}>{r.korName || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{r.source || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '200px' }}>{r.hazard || '-'}</td>
                  <td style={tdStyle}>
                    {r.status === 'success' && <span style={{ color: '#276749', fontWeight: '700', fontSize: '12px' }}>✅ 성공</span>}
                    {r.status === 'notfound' && <span style={{ color: C.muted, fontSize: '12px' }}>미등록</span>}
                    {r.status === 'error' && <span style={{ color: C.danger, fontSize: '12px' }}>❌ 오류</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
//  변경 요청 탭
// ══════════════════════════════════════════════
function ChangeRequestTab() {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [adminName, setAdminName] = useState('')

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('reagent_change_requests')
      .select('*, reagents(name)')
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  async function approve(req) {
    if (!adminName.trim()) { alert('승인자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagents?.name}"의 ${req.field_name}을 "${req.new_value}"로 변경하시겠습니까?`)) return

    await supabase.from('reagents').update({ [req.field_name]: req.new_value }).eq('id', req.reagent_id)
    await supabase.from('reagent_change_requests').update({
      status: 'approved', approved_by: adminName, approved_at: new Date().toISOString()
    }).eq('id', req.id)
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '변경 요청 승인',
      target_type: 'reagent', target_id: req.reagent_id,
      description: `${req.reagents?.name} ${req.field_name}: "${req.old_value}" → "${req.new_value}"`,
    })
    fetchRequests()
  }

  async function reject(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm('변경 요청을 반려하시겠습니까?')) return
    await supabase.from('reagent_change_requests').update({ status: 'rejected', approved_by: adminName }).eq('id', req.id)
    fetchRequests()
  }

  const fieldLabels = { name: '시약명', volume: '용량', unit: '단위', category: '성상/유별', hazard: '유해위험성', cas_no: 'CAS No.' }
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, rejected: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })

  return (
    <Card title="📝 시약 정보 변경 요청" sub="Change Requests">
      <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>처리자 이름 *</label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {[['all', '전체'], ['pending', '대기중'], ['approved', '승인됨'], ['rejected', '반려']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === key ? C.navy : C.bg, color: filter === key ? '#fff' : C.text,
            fontSize: '12px', fontWeight: filter === key ? '700' : '400',
          }}>{label} <span style={{ opacity: 0.7 }}>({counts[key] ?? 0})</span></button>
        ))}
      </div>

      {filtered.length === 0
        ? <div style={{ textAlign: 'center', padding: '40px', color: C.muted, fontSize: '14px' }}>변경 요청이 없습니다.</div>
        : filtered.map(req => (
          <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '16px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{
                background: req.status === 'pending' ? '#FFF3E0' : req.status === 'approved' ? '#E8F5E9' : '#FFEBEE',
                color: req.status === 'pending' ? '#E65100' : req.status === 'approved' ? '#2E7D32' : '#C62828',
                fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px',
              }}>{req.status === 'pending' ? '대기중' : req.status === 'approved' ? '승인됨' : '반려'}</span>
              <span style={{ fontWeight: '700', color: C.navy, fontSize: '14px' }}>{req.reagents?.name}</span>
              <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>
                요청자: {req.requested_by} · {new Date(req.created_at).toLocaleDateString()}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '10px' }}>
              <div><span style={{ color: C.muted, fontSize: '11px' }}>변경 항목</span><br /><strong>{fieldLabels[req.field_name] || req.field_name}</strong></div>
              <div><span style={{ color: C.muted, fontSize: '11px' }}>현재 값</span><br /><span style={{ color: C.muted }}>{req.old_value || '(없음)'}</span></div>
              <div><span style={{ color: C.muted, fontSize: '11px' }}>변경할 값</span><br /><strong style={{ color: C.navy }}>{req.new_value}</strong></div>
            </div>
            {req.approved_by && (
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '8px' }}>
                처리자: {req.approved_by} · {req.approved_at ? new Date(req.approved_at).toLocaleDateString() : ''}
              </div>
            )}
            {req.status === 'pending' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => approve(req)} style={{ ...btnPrimary, background: '#38A169', padding: '6px 14px', fontSize: '12px' }}>✓ 승인</button>
                <button onClick={() => reject(req)} style={{ ...btnPrimary, background: C.danger, padding: '6px 14px', fontSize: '12px' }}>✗ 반려</button>
              </div>
            )}
          </div>
        ))}
    </Card>
  )
}

// ══════════════════════════════════════════════
//  슈퍼관리자 탭 (비밀번호 변경 + FCM 토큰 초기화)
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
//  슈퍼관리자 탭 (비밀번호 변경 + FCM 토큰 초기화 + 실험실 규칙 + 안전 브리핑)
// ══════════════════════════════════════════════
function SuperTab() {
  const [adminPw, setAdminPw] = useState({ current: '', new1: '', new2: '' })
  const [superPw, setSuperPw] = useState({ current: '', new1: '', new2: '' })
  const [tokenCount, setTokenCount] = useState(0)

  // 실험실 규칙
  const [rules, setRules] = useState([])
  const [newRule, setNewRule] = useState('')
  const [editingRule, setEditingRule] = useState(null) // { id, content }

  // 안전 브리핑
  const [briefings, setBriefings] = useState([])
  const [newBriefing, setNewBriefing] = useState('')
  const [editingBriefing, setEditingBriefing] = useState(null)

  useEffect(() => {
    fetchTokenCount()
    fetchRules()
    fetchBriefings()
  }, [])

  async function fetchTokenCount() {
    const { count } = await supabase.from('fcm_tokens').select('*', { count: 'exact', head: true })
    setTokenCount(count || 0)
  }

  async function fetchRules() {
    const { data } = await supabase.from('lab_rules').select('*').order('order_no')
    if (data) setRules(data)
  }

  async function fetchBriefings() {
    const { data } = await supabase.from('safety_briefings').select('*').order('created_at', { ascending: false })
    if (data) setBriefings(data)
  }

  async function changeAdminPassword() {
    if (!adminPw.new1.trim()) { alert('새 비밀번호를 입력해주세요'); return }
    if (adminPw.new1 !== adminPw.new2) { alert('새 비밀번호가 일치하지 않습니다'); return }
    if (adminPw.new1.length < 6) { alert('비밀번호는 6자 이상이어야 합니다'); return }
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_password').single()
    if (data?.value !== adminPw.current) { alert('현재 비밀번호가 틀렸습니다'); return }
    await supabase.from('app_settings').update({ value: adminPw.new1 }).eq('key', 'admin_password')
    await supabase.from('fcm_tokens').delete().eq('role', 'admin')
    alert('✅ 일반관리자 비밀번호가 변경되었습니다.\n기존 관리자 기기의 알림이 초기화되었어요.')
    setAdminPw({ current: '', new1: '', new2: '' })
    fetchTokenCount()
  }

  async function changeSuperPassword() {
    if (!superPw.new1.trim()) { alert('새 비밀번호를 입력해주세요'); return }
    if (superPw.new1 !== superPw.new2) { alert('새 비밀번호가 일치하지 않습니다'); return }
    if (superPw.new1.length < 6) { alert('비밀번호는 6자 이상이어야 합니다'); return }
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'super_password').single()
    if (data?.value !== superPw.current) { alert('현재 비밀번호가 틀렸습니다'); return }
    await supabase.from('app_settings').update({ value: superPw.new1 }).eq('key', 'super_password')
    await supabase.from('fcm_tokens').delete().eq('role', 'admin')
    alert('✅ 슈퍼관리자 비밀번호가 변경되었습니다.\nFCM 토큰도 초기화되었어요.')
    setSuperPw({ current: '', new1: '', new2: '' })
    fetchTokenCount()
  }

  async function clearAllTokens() {
    if (!window.confirm('모든 FCM 토큰을 삭제하시겠습니까?\n모든 기기에서 알림이 초기화됩니다.')) return
    await supabase.from('fcm_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    alert('FCM 토큰이 초기화되었습니다.')
    fetchTokenCount()
  }

  // 실험실 규칙
  async function addRule() {
    if (!newRule.trim()) return
    const maxOrder = rules.length > 0 ? Math.max(...rules.map(r => r.order_no)) + 1 : 0
    await supabase.from('lab_rules').insert({ content: newRule.trim(), order_no: maxOrder })
    setNewRule('')
    fetchRules()
  }

  async function saveRule(id) {
    if (!editingRule?.content.trim()) return
    await supabase.from('lab_rules').update({ content: editingRule.content }).eq('id', id)
    setEditingRule(null)
    fetchRules()
  }

  async function deleteRule(id) {
    if (!window.confirm('규칙을 삭제하시겠습니까?')) return
    await supabase.from('lab_rules').delete().eq('id', id)
    fetchRules()
  }

  async function moveRule(id, direction) {
    const idx = rules.findIndex(r => r.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= rules.length) return
    const a = rules[idx], b = rules[swapIdx]
    await supabase.from('lab_rules').update({ order_no: b.order_no }).eq('id', a.id)
    await supabase.from('lab_rules').update({ order_no: a.order_no }).eq('id', b.id)
    fetchRules()
  }

  // 안전 브리핑
  async function addBriefing() {
    if (!newBriefing.trim()) return
    await supabase.from('safety_briefings').insert({ content: newBriefing.trim() })
    setNewBriefing('')
    fetchBriefings()
  }

  async function saveBriefing(id) {
    if (!editingBriefing?.content.trim()) return
    await supabase.from('safety_briefings').update({ content: editingBriefing.content }).eq('id', id)
    setEditingBriefing(null)
    fetchBriefings()
  }

  async function deleteBriefing(id) {
    if (!window.confirm('브리핑 문구를 삭제하시겠습니까?')) return
    await supabase.from('safety_briefings').delete().eq('id', id)
    fetchBriefings()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* 실험실 규칙 편집 */}
      <Card title="📋 실험실 규칙 편집" sub="홈 화면에 표시됩니다">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            value={newRule}
            onChange={e => setNewRule(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRule()}
            placeholder="새 규칙 입력 후 Enter"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addRule} style={{ ...btnPrimary, padding: '9px 18px' }}>추가</button>
        </div>
        {rules.length === 0
          ? <div style={{ color: C.muted, fontSize: '13px' }}>등록된 규칙이 없습니다.</div>
          : rules.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 0', borderBottom: i < rules.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{
                minWidth: '22px', height: '22px', background: C.navy, color: '#fff',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', flexShrink: 0,
              }}>{i + 1}</span>

              {editingRule?.id === r.id ? (
                <>
                  <input
                    value={editingRule.content}
                    onChange={e => setEditingRule({ ...editingRule, content: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                    autoFocus
                  />
                  <button onClick={() => saveRule(r.id)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: '12px' }}>저장</button>
                  <button onClick={() => setEditingRule(null)} style={{ ...btnGhost, padding: '5px 10px', fontSize: '12px' }}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', color: C.text }}>{r.content}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => moveRule(r.id, 'up')} disabled={i === 0}
                      style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: C.muted, fontSize: '14px', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => moveRule(r.id, 'down')} disabled={i === rules.length - 1}
                      style={{ background: 'none', border: 'none', cursor: i === rules.length - 1 ? 'default' : 'pointer', color: C.muted, fontSize: '14px', opacity: i === rules.length - 1 ? 0.3 : 1 }}>↓</button>
                    <button onClick={() => setEditingRule({ id: r.id, content: r.content })}
                      style={{ ...btnGhost, padding: '3px 10px', fontSize: '12px' }}>수정</button>
                    <button onClick={() => deleteRule(r.id)}
                      style={{ background: '#FFF5F5', color: C.danger, border: `1px solid #FC8181`, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
                  </div>
                </>
              )}
            </div>
          ))}
      </Card>

      {/* 안전 브리핑 편집 */}
      <Card title="📢 안전 브리핑 문구 편집" sub="홈 화면에서 10초마다 랜덤 전환됩니다">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            value={newBriefing}
            onChange={e => setNewBriefing(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBriefing()}
            placeholder="새 브리핑 문구 입력 후 Enter"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addBriefing} style={{ ...btnPrimary, padding: '9px 18px' }}>추가</button>
        </div>
        {briefings.length === 0
          ? <div style={{ color: C.muted, fontSize: '13px' }}>등록된 브리핑 문구가 없습니다.</div>
          : briefings.map((b, i) => (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 0', borderBottom: i < briefings.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ fontSize: '16px' }}>📢</span>
              {editingBriefing?.id === b.id ? (
                <>
                  <input
                    value={editingBriefing.content}
                    onChange={e => setEditingBriefing({ ...editingBriefing, content: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                    autoFocus
                  />
                  <button onClick={() => saveBriefing(b.id)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: '12px' }}>저장</button>
                  <button onClick={() => setEditingBriefing(null)} style={{ ...btnGhost, padding: '5px 10px', fontSize: '12px' }}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', color: C.text, lineHeight: 1.5 }}>{b.content}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => setEditingBriefing({ id: b.id, content: b.content })}
                      style={{ ...btnGhost, padding: '3px 10px', fontSize: '12px' }}>수정</button>
                    <button onClick={() => deleteBriefing(b.id)}
                      style={{ background: '#FFF5F5', color: C.danger, border: `1px solid #FC8181`, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
                  </div>
                </>
              )}
            </div>
          ))}
      </Card>

      {/* 일반관리자 비밀번호 변경 */}
      <Card title="🔑 일반관리자 비밀번호 변경" sub="관리자 비밀번호 변경 시 FCM 토큰도 초기화됩니다">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px' }}>
          <div><label style={labelStyle}>현재 비밀번호</label>
            <input type="password" value={adminPw.current} onChange={e => setAdminPw({ ...adminPw, current: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>새 비밀번호 (6자 이상)</label>
            <input type="password" value={adminPw.new1} onChange={e => setAdminPw({ ...adminPw, new1: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>새 비밀번호 확인</label>
            <input type="password" value={adminPw.new2} onChange={e => setAdminPw({ ...adminPw, new2: e.target.value })} style={inputStyle} /></div>
          <button onClick={changeAdminPassword} style={{ ...btnPrimary }}>변경</button>
        </div>
      </Card>

      {/* 슈퍼관리자 비밀번호 변경 */}
      <Card title="👑 슈퍼관리자 비밀번호 변경">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px' }}>
          <div><label style={labelStyle}>현재 비밀번호</label>
            <input type="password" value={superPw.current} onChange={e => setSuperPw({ ...superPw, current: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>새 비밀번호 (6자 이상)</label>
            <input type="password" value={superPw.new1} onChange={e => setSuperPw({ ...superPw, new1: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>새 비밀번호 확인</label>
            <input type="password" value={superPw.new2} onChange={e => setSuperPw({ ...superPw, new2: e.target.value })} style={inputStyle} /></div>
          <button onClick={changeSuperPassword} style={{ ...btnPrimary }}>변경</button>
        </div>
      </Card>

      {/* FCM 토큰 관리 */}
      <Card title="🔔 FCM 알림 토큰 관리">
        <div style={{ fontSize: '13px', color: C.muted, marginBottom: '16px' }}>
          현재 등록된 알림 토큰: <strong style={{ color: C.navy }}>{tokenCount}개</strong>
        </div>
        <div style={{ padding: '12px 16px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
          ⚠️ 비밀번호 변경 시 자동으로 토큰이 초기화됩니다. 수동으로 초기화가 필요한 경우에만 아래 버튼을 사용하세요.
        </div>
        <button onClick={clearAllTokens} style={{ ...btnPrimary, background: '#D63031' }}>🗑️ 전체 토큰 초기화</button>
      </Card>

    </div>
  )
}

