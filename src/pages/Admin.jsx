import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, labelStyle, btnPrimary } from '../design'

const initialForm = {
  name: '',
  cas_no: '',
  company: '',
  hazard: '',
  category: '',
  volume: '',
  unit: '',
  location_id: '',
  notes: '',
  lot_no: '',
  expiry_date: '',
  received_date: '',
}

function getFirstStringWithMarkup(value) {
  if (!Array.isArray(value)) return ''
  return value
    .slice(0, 3)
    .map(item => item?.String?.split('(')[0]?.trim())
    .filter(Boolean)
    .join(', ')
}

function findSection(sections, heading) {
  if (!Array.isArray(sections)) return null
  for (const section of sections) {
    if (section.TOCHeading === heading) return section
    const nested = findSection(section.Section, heading)
    if (nested) return nested
  }
  return null
}

function extractHazardText(ghsData) {
  const ghsClass = findSection(ghsData?.Record?.Section, 'GHS Classification')
  const hazardInfo = ghsClass?.Information?.find(info => info.Name === 'GHS Hazard Statements')
  return getFirstStringWithMarkup(hazardInfo?.Value?.StringWithMarkup)
}

function ReagentAddTab({ locations }) {
  const [form, setForm] = useState(initialForm)
  const [adminName, setAdminName] = useState('')
  const [casLoading, setCasLoading] = useState(false)
  const [casResult, setCasResult] = useState(null)

  async function lookupCAS() {
    const cas = form.cas_no.trim()
    if (!cas) {
      alert('CAS 번호를 먼저 입력해주세요')
      return
    }

    setCasLoading(true)
    setCasResult(null)

    try {
      const cidRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/cids/JSON`
      )
      if (!cidRes.ok) throw new Error('CAS 번호를 찾을 수 없어요')

      const cidData = await cidRes.json()
      const cid = cidData?.IdentifierList?.CID?.[0]
      if (!cid) throw new Error('CAS 번호에 해당하는 PubChem CID가 없어요')

      const propRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IUPACName,MolecularFormula/JSON`
      )
      if (!propRes.ok) throw new Error('시약 상세 정보를 불러오지 못했어요')

      const propData = await propRes.json()
      const prop = propData?.PropertyTable?.Properties?.[0] || {}

      let hazardText = ''
      const ghsRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=GHS+Classification`
      )
      if (ghsRes.ok) {
        const ghsData = await ghsRes.json()
        hazardText = extractHazardText(ghsData)
      }

      const result = {
        iupacName: prop.IUPACName || '',
        formula: prop.MolecularFormula || '',
        hazard: hazardText,
        cid,
      }

      setCasResult(result)
      setForm(prev => ({
        ...prev,
        name: prev.name || result.iupacName,
        hazard: prev.hazard || result.hazard,
        category: prev.category || result.formula,
      }))
    } catch (err) {
      setCasResult({ error: err.message || '조회에 실패했어요' })
    } finally {
      setCasLoading(false)
    }
  }

  async function addReagent() {
    if (!form.name.trim()) {
      alert('시약 이름을 입력해주세요')
      return
    }
    if (!adminName.trim()) {
      alert('작업자 이름을 입력해주세요')
      return
    }

    const { data: reagent, error } = await supabase.from('reagents').insert({
      name: form.name.trim(),
      cas_no: form.cas_no.trim(),
      company: form.company.trim(),
      hazard: form.hazard.trim(),
      category: form.category.trim(),
      volume: form.volume || null,
      unit: form.unit.trim(),
      location_id: form.location_id || null,
      notes: form.notes.trim(),
    }).select().single()

    if (error) {
      alert(`시약 추가 실패: ${error.message}`)
      return
    }

    if (reagent) {
      await supabase.from('reagent_lots').insert({
        reagent_id: reagent.id,
        lot_no: form.lot_no.trim(),
        sealed_count: 0,
        current_stock: 100,
        expiry_date: form.expiry_date || null,
        received_date: form.received_date || null,
      })

      await supabase.from('admin_logs').insert({
        admin_name: adminName.trim(),
        action: '시약 추가',
        target_type: 'reagent',
        target_id: reagent.id,
        description: `시약 추가: ${form.name.trim()}`,
      })

      alert('시약이 추가되었습니다')
      setForm(initialForm)
      setCasResult(null)
    }
  }

  return (
    <Card title="시약 추가" sub="Add Reagent">
      <div style={{
        marginBottom: '20px',
        padding: '12px 16px',
        background: '#F0F4FF',
        borderRadius: '8px',
        border: '1px solid #C3D0F5',
      }}>
        <label style={labelStyle}>
          작업자 이름 * <span style={{ color: C.muted, fontWeight: '400', textTransform: 'none' }}>(로그에 기록됩니다)</span>
        </label>
        <input
          value={adminName}
          onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름"
          style={{ ...inputStyle, maxWidth: '240px' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>CAS No.</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input
              value={form.cas_no}
              onChange={e => {
                setForm({ ...form, cas_no: e.target.value })
                setCasResult(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') lookupCAS()
              }}
              placeholder="예: 64-17-5"
              style={{ ...inputStyle, maxWidth: '240px' }}
            />
            <button
              type="button"
              onClick={lookupCAS}
              disabled={casLoading}
              style={{
                ...btnPrimary,
                background: '#6C63FF',
                opacity: casLoading ? 0.7 : 1,
                whiteSpace: 'nowrap',
                padding: '9px 18px',
              }}
            >
              {casLoading ? '조회 중...' : '자동완성'}
            </button>
          </div>

          {casResult && !casResult.error && (
            <div style={{
              marginTop: '10px',
              padding: '12px 16px',
              background: '#F0FFF4',
              border: '1px solid #9AE6B4',
              borderRadius: '8px',
              fontSize: '13px',
            }}>
              <div style={{ fontWeight: '700', color: '#276749', marginBottom: '6px' }}>PubChem 조회 성공</div>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', color: '#2D6A4F' }}>
                {casResult.iupacName && <span><strong>IUPAC명:</strong> {casResult.iupacName}</span>}
                {casResult.formula && <span><strong>분자식:</strong> {casResult.formula}</span>}
                {casResult.hazard && <span><strong>GHS:</strong> {casResult.hazard}</span>}
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#52B788' }}>
                빈 칸에 자동 입력되었습니다. 필요한 경우 직접 수정할 수 있습니다.
              </div>
            </div>
          )}

          {casResult?.error && (
            <div style={{
              marginTop: '10px',
              padding: '10px 14px',
              background: '#FFF5F5',
              border: '1px solid #FC8181',
              borderRadius: '8px',
              fontSize: '13px',
              color: C.danger,
            }}>
              {casResult.error} - CAS 번호를 확인해주세요.
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>시약명 *</label>
          <input value={form.name} placeholder="예: Ethanol" onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>회사명</label>
          <input value={form.company} placeholder="예: Sigma-Aldrich" onChange={e => setForm({ ...form, company: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>유해/위험성</label>
          <input value={form.hazard} placeholder="예: 인화성 액체" onChange={e => setForm({ ...form, hazard: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>유별/성질</label>
          <input value={form.category} placeholder="예: C2H6O" onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>용량</label>
          <input value={form.volume} placeholder="예: 500" onChange={e => setForm({ ...form, volume: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>단위</label>
          <input value={form.unit} placeholder="예: mL" onChange={e => setForm({ ...form, unit: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Lot No.</label>
          <input value={form.lot_no} onChange={e => setForm({ ...form, lot_no: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>유통기한</label>
          <input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>입고일</label>
          <input type="date" value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>위치</label>
          <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
            <option value="">선택하세요</option>
            {locations.map(location => (
              <option key={location.id} value={location.id}>
                {location.room}{location.detail ? ` - ${location.detail}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>비고</label>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
        </div>
      </div>

      <button type="button" onClick={addReagent} style={{ ...btnPrimary, marginTop: '20px' }}>시약 추가</button>
    </Card>
  )
}

export default function Admin() {
  const [locations, setLocations] = useState([])

  useEffect(() => {
    supabase.from('locations').select('*').order('room').then(({ data }) => {
      if (data) setLocations(data)
    })
  }, [])

  return (
    <div>
      <PageBanner
        title="관리자"
        sub="Admin Panel"
        breadcrumb={['홈', '관리자']}
      />
      <div style={{ padding: '28px 40px' }}>
        <ReagentAddTab locations={locations} />
      </div>
    </div>
  )
}
