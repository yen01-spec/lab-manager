import { useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary } from '../../design'
import CompanyPicker from '../CompanyPicker'

// ══════════════════════════════════════════════
//  시약 추가 (CAS 자동조회 포함)
// ══════════════════════════════════════════════
export default function ReagentAddTab({ locations, student }) {
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

    // 이미 같은 이름의 마스터가 있으면 신규 시약을 또 만들지 않고 기존 시약에 Lot으로 추가하도록 유도
    // (재구매인데 매번 새 시약으로 등록되던 문제의 재발 방지). 이름이 같은 row가 여러 개 있을 수 있어서
    // (예: Lot 미등록으로 병합에서 제외된 "미상" row) Lot을 실제로 갖고 있는 쪽을 진짜 마스터로 우선한다.
    const { data: existingCandidates } = await supabase.from('reagents')
      .select('id, name, reagent_lots(id)').ilike('name', form.name.trim()).neq('status', 'archived')
    const existing = (existingCandidates || []).sort((a, b) => (b.reagent_lots?.length || 0) - (a.reagent_lots?.length || 0))
    if (existing.length > 0) {
      const addAsLot = window.confirm(
        `"${existing[0].name}" 시약이 이미 등록되어 있어요.\n새 시약으로 또 만들지 않고, 기존 시약에 새 Lot(재구매분)으로 추가할까요?\n\n확인 = 기존 시약에 Lot 추가\n취소 = 그래도 새 시약으로 등록`
      )
      if (addAsLot) {
        const { error: lotError } = await supabase.from('reagent_lots').insert({
          reagent_id: existing[0].id, lot_no: form.lot_no || null,
          sealed_count: 0, current_stock: 100,
          expiry_date: form.expiry_date || null, received_date: form.received_date || null,
          location_id: form.location_id || null, status: 'active',
        })
        if (lotError) { alert('Lot 추가 중 오류가 발생했습니다: ' + lotError.message); return }
        await supabase.from('admin_logs').insert({
          admin_name: adminName, action: '재고 등록(기존 시약)',
          target_type: 'reagent',
          description: `기존 시약에 Lot 추가: ${existing[0].name}`,
        })
        alert('기존 시약에 새 Lot이 추가되었습니다!')
        setForm(init)
        setCasResult(null)
        return
      }
    }

    const { data: r } = await supabase.from('reagents').insert({
      name: form.name, cas_no: form.cas_no, company: form.company,
      hazard: form.hazard, category: form.category,
      volume: form.volume || null, unit: form.unit,
      notes: form.notes,
      registered_by: student?.student_id ?? null,
    }).select().single()
    if (r) {
      await supabase.from('reagent_lots').insert({
        reagent_id: r.id, lot_no: form.lot_no,
        sealed_count: 0, current_stock: 100,
        expiry_date: form.expiry_date || null,
        received_date: form.received_date || null,
        location_id: form.location_id || null, status: 'active',
      })
      await supabase.from('admin_logs').insert({
        admin_name: adminName, action: '시약 추가',
        target_type: 'reagent',
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
          <CompanyPicker value={form.company} placeholder="예: Sigma-Aldrich"
            onChange={v => setForm({ ...form, company: v })} style={inputStyle} /></div>
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
