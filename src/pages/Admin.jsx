function ReagentAddTab({ locations }) {
  const init = {
    name: '', cas_no: '', company: '', hazard: '', category: '',
    volume: '', unit: '', location_id: '', notes: '',
    lot_no: '', expiry_date: '', received_date: ''
  }
  const [form, setForm] = useState(init)
  const [adminName, setAdminName] = useState('')
  const [casLoading, setCasLoading] = useState(false)
  const [casResult, setCasResult] = useState(null) // 조회 결과 표시용

  // ── CAS 자동조회 (PubChem API) ──────────────────────
  async function lookupCAS() {
    const cas = form.cas_no.trim()
    if (!cas) { alert('CAS 번호를 먼저 입력해주세요'); return }
    setCasLoading(true)
    setCasResult(null)
    try {
      // 1) CAS로 PubChem CID 조회
      const cidRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/cids/JSON`
      )
      if (!cidRes.ok) throw new Error('CAS 번호를 찾을 수 없어요')
      const cidData = await cidRes.json()
      const cid = cidData.IdentifierList.CID[0]

      // 2) CID로 상세 정보 조회
      const propRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/IUPACName,MolecularFormula/JSON`
      )
      const propData = await propRes.json()
      const prop = propData.PropertyTable.Properties[0]

      // 3) GHS 위험성 조회
      const ghsRes = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=GHS+Classification`
      )
      let hazardText = ''
      if (ghsRes.ok) {
        const ghsData = await ghsRes.json()
        try {
          const sections = ghsData.Record.Section
          const ghsSection = sections?.find(s => s.TOCHeading === 'Safety and Hazards')
          const hazSection = ghsSection?.Section?.find(s => s.TOCHeading === 'Hazards Identification')
          const ghsClass = hazSection?.Section?.find(s => s.TOCHeading === 'GHS Classification')
          const hazardStatements = ghsClass?.Information?.find(i => i.Name === 'GHS Hazard Statements')
          if (hazardStatements?.Value?.StringWithMarkup) {
            hazardText = hazardStatements.Value.StringWithMarkup
              .slice(0, 3)
              .map(s => s.String.split('(')[0].trim())
              .join(', ')
          }
        } catch {}
      }

      const result = {
        iupacName: prop.IUPACName || '',
        formula: prop.MolecularFormula || '',
        hazard: hazardText,
        cid,
      }
      setCasResult(result)

      // 폼에 자동 입력 (빈 칸만 채움)
      setForm(prev => ({
        ...prev,
        name: prev.name || result.iupacName,
        hazard: prev.hazard || result.hazard,
        category: prev.category || result.formula,
      }))
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
      {/* 작업자 이름 */}
      <div style={{ marginBottom: '20px', padding: '12px 16px',
        background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>작업자 이름 * <span style={{ color: C.muted, fontWeight: '400', textTransform: 'none' }}>(로그에 기록됩니다)</span></label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* CAS No. — 자동조회 버튼 포함 */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>CAS No.</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
              value={form.cas_no}
              onChange={e => { setForm({ ...form, cas_no: e.target.value }); setCasResult(null) }}
              onKeyDown={e => e.key === 'Enter' && lookupCAS()}
              placeholder="예: 64-17-5"
              style={{ ...inputStyle, maxWidth: '240px' }}
            />
            <button
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
              {casLoading ? '조회 중...' : '🔍 자동완성'}
            </button>
          </div>

          {/* 조회 결과 표시 */}
          {casResult && !casResult.error && (
            <div style={{
              marginTop: '10px', padding: '12px 16px',
              background: '#F0FFF4', border: '1px solid #9AE6B4',
              borderRadius: '8px', fontSize: '13px',
            }}>
              <div style={{ fontWeight: '700', color: '#276749', marginBottom: '6px' }}>✅ PubChem 조회 성공</div>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', color: '#2D6A4F' }}>
                {casResult.iupacName && <span><strong>IUPAC명:</strong> {casResult.iupacName}</span>}
                {casResult.formula && <span><strong>분자식:</strong> {casResult.formula}</span>}
                {casResult.hazard && <span><strong>GHS:</strong> {casResult.hazard}</span>}
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#52B788' }}>
                빈 칸에 자동 입력됐어요. 직접 수정도 가능해요.
              </div>
            </div>
          )}
          {casResult?.error && (
            <div style={{
              marginTop: '10px', padding: '10px 14px',
              background: '#FFF5F5', border: '1px solid #FC8181',
              borderRadius: '8px', fontSize: '13px', color: C.danger,
            }}>
              ❌ {casResult.error} — CAS 번호를 확인해주세요
            </div>
          )}
        </div>

        {/* 나머지 필드 */}
        <div>
          <label style={labelStyle}>시약명 *</label>
          <input value={form.name} placeholder="예: Ethanol"
            onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>회사명</label>
          <input value={form.company} placeholder="예: Sigma-Aldrich"
            onChange={e => setForm({ ...form, company: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>유해·위험성</label>
          <input value={form.hazard} placeholder="예: 인화성 액체"
            onChange={e => setForm({ ...form, hazard: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>유별/성질</label>
          <input value={form.category} placeholder="예: 액체"
            onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>용량</label>
          <input value={form.volume} placeholder="예: 500"
            onChange={e => setForm({ ...form, volume: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>단위</label>
          <input value={form.unit} placeholder="예: mL"
            onChange={e => setForm({ ...form, unit: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Lot No.</label>
          <input value={form.lot_no}
            onChange={e => setForm({ ...form, lot_no: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>유통기한</label>
          <input type="date" value={form.expiry_date}
            onChange={e => setForm({ ...form, expiry_date: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>입고일</label>
          <input type="date" value={form.received_date}
            onChange={e => setForm({ ...form, received_date: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>위치</label>
          <select value={form.location_id}
            onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
            <option value="">선택하세요</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>비고</label>
          <input value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
        </div>
      </div>

      <button onClick={addReagent} style={{ ...btnPrimary, marginTop: '20px' }}>시약 추가</button>
    </Card>
  )
}