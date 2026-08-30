import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../../design'
import CompanyPicker from '../CompanyPicker'

// ══════════════════════════════════════════════
//  시약 일괄정리 탭 — src/pages/BulkEdit.jsx(/reagents/bulk-edit)에서 사용
// ══════════════════════════════════════════════
export default function BulkEditTab({ locations, student }) {
  const [reagents, setReagents] = useState([])
  const [loading, setLoading] = useState(false)
  const [roomFilter, setRoomFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [cols, setCols] = useState({ location: true, stock: true, company: true, expiry: false })
  const [edits, setEdits] = useState({}) // { [reagentId]: { location_id?, company?, current_stock? } }
  const [saving, setSaving] = useState(false)

  const rooms = [...new Set(locations.map(l => l.room))]

  useEffect(() => { fetchReagents() }, [])

  // 대표 Lot: 활성 Lot 중 하나(없으면 null) — 이 화면은 마스터 필드 + 대표 Lot 하나만 다룸(여러 Lot 개별 일괄수정은 별도 기능)
  function repLot(r) {
    return (r.reagent_lots || []).find(l => l.status === 'active') || null
  }
  function activeLotCount(r) {
    return (r.reagent_lots || []).filter(l => l.status === 'active').length
  }

  // companyOverride — 로고를 클릭한 직후엔 setCompanyFilter가 아직 리렌더 전이라
  // companyFilter를 그대로 읽으면 클릭 직전 값(한 박자 늦은 값)을 쓰게 됨. 방금 고른
  // 값을 바로 넘겨받아 쓰도록 옵션 인자로 받음.
  async function fetchReagents(companyOverride) {
    setLoading(true)
    const companyTerm = companyOverride ?? companyFilter
    let query = supabase.from('reagents')
      .select('*, reagent_lots(*)')
      .neq('status', 'archived')
      .order('name')
      .range(0, 2999)
    if (companyTerm.trim()) query = query.ilike('company', `%${companyTerm.trim()}%`)
    const { data } = await query
    let filtered = data || []
    if (roomFilter) filtered = filtered.filter(r => locations.find(l => l.id === repLot(r)?.location_id)?.room === roomFilter)
    setReagents(filtered)
    setLoading(false)
  }

  function toggleCheck(id) {
    const next = new Set(checkedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setCheckedIds(next)
  }
  function toggleAll() {
    if (checkedIds.size === reagents.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(reagents.map(r => r.id)))
  }

  function setEdit(reagentId, field, value) {
    setEdits(prev => ({ ...prev, [reagentId]: { ...prev[reagentId], [field]: value } }))
  }
  function clearEditIfSame(reagentId, field, value, original) {
    if (String(value) === String(original ?? '')) {
      setEdits(prev => {
        const next = { ...prev }
        if (next[reagentId]) {
          const { [field]: _, ...rest } = next[reagentId]
          if (Object.keys(rest).length === 0) delete next[reagentId]
          else next[reagentId] = rest
        }
        return next
      })
    } else {
      setEdit(reagentId, field, value)
    }
  }

  const changedReagentCount = Object.keys(edits).length
  const changedCellCount = Object.values(edits).reduce((s, e) => s + Object.keys(e).length, 0)

  async function saveAll() {
    if (changedReagentCount === 0) return
    if (!window.confirm(`${changedReagentCount}개 시약 · ${changedCellCount}개 항목을 저장하시겠습니까?`)) return
    setSaving(true)
    for (const [reagentId, fields] of Object.entries(edits)) {
      if (fields.company !== undefined) {
        await supabase.from('reagents').update({ company: fields.company }).eq('id', reagentId)
      }
      const r = reagents.find(x => x.id === reagentId)
      const lot = repLot(r)
      if (lot) {
        const lotFields = {}
        if (fields.location_id !== undefined) lotFields.location_id = fields.location_id
        if (fields.current_stock !== undefined) { lotFields.current_stock = Number(fields.current_stock); lotFields.needs_review = false }
        if (Object.keys(lotFields).length > 0) {
          await supabase.from('reagent_lots').update(lotFields).eq('id', lot.id)
        }
      }
    }
    await supabase.from('admin_logs').insert({
      admin_name: student?.name || '', action: '시약 일괄정리',
      target_type: 'reagent',
      description: `${changedReagentCount}개 시약 · ${changedCellCount}개 항목 일괄 저장`,
    })
    setEdits({})
    setSaving(false)
    fetchReagents()
    alert('저장되었습니다!')
  }

  const changedStyle = { background: C.blueTint, borderRadius: '4px' }

  return (
    <Card title="🧹 시약 일괄정리" sub="Bulk Edit">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '160px' }}>
          <option value="">전체 실험실</option>
          {rooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <CompanyPicker value={companyFilter} onChange={setCompanyFilter} onPick={v => fetchReagents(v)} onKeyDown={e => e.key === 'Enter' && fetchReagents()}
          placeholder="제조사 검색" style={{ ...inputStyle, maxWidth: '160px' }} />
        <button onClick={fetchReagents} style={{ ...btnGhost, padding: '8px 16px' }}>필터 적용</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11.5px', color: C.muted }}>표시 열</span>
        {[['location', '위치'], ['stock', '잔량'], ['company', '회사'], ['expiry', '유효기간']].map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.textSub }}>
            <input type="checkbox" checked={cols[key]} onChange={() => setCols(c => ({ ...c, [key]: !c[key] }))} />{label}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
        <span style={{ fontSize: '12.5px', color: C.text }}>
          <b>{reagents.length}개</b> 필터결과 · <b>{checkedIds.size}개</b> 선택됨
          {changedReagentCount > 0 && (
            <span style={{ marginLeft: '10px', color: C.blueDark, fontWeight: '700', background: C.blueTint, padding: '3px 10px', borderRadius: '999px', fontSize: '12px' }}>
              변경된 시약 {changedReagentCount}개 · 변경된 셀 {changedCellCount}개
            </span>
          )}
        </span>
        <button onClick={saveAll} disabled={changedReagentCount === 0 || saving} style={{
          ...btnPrimary, padding: '8px 18px', opacity: changedReagentCount === 0 || saving ? 0.5 : 1,
          cursor: changedReagentCount === 0 || saving ? 'default' : 'pointer',
        }}>{saving ? '저장 중...' : '전체 저장'}</button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={reagents.length > 0 && checkedIds.size === reagents.length} onChange={toggleAll} /></th>
                <th style={thStyle}>시약명</th>
                {cols.location && <th style={thStyle}>위치</th>}
                {cols.stock && <th style={thStyle}>잔량</th>}
                {cols.company && <th style={thStyle}>회사</th>}
                {cols.expiry && <th style={thStyle}>유효기간</th>}
              </tr>
            </thead>
            <tbody>
              {reagents.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: C.muted }}>조건에 맞는 시약이 없습니다.</td></tr>
              ) : reagents.map(r => {
                const lot = repLot(r)
                const multiLot = activeLotCount(r) > 1
                const edit = edits[r.id] || {}
                return (
                  <tr key={r.id}>
                    <td style={tdStyle}><input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => toggleCheck(r.id)} /></td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>
                      {r.name}
                      {multiLot && <span title="활성 Lot이 여러 개 — 여기서는 그중 하나만 수정됩니다. 나머지는 시약 상세페이지에서 개별 수정하세요."
                        style={{ marginLeft: '6px', fontSize: '10.5px', fontWeight: '700', color: '#B7791F', background: '#FDF3DD', padding: '1px 6px', borderRadius: '8px' }}>Lot {activeLotCount(r)}개</span>}
                    </td>
                    {cols.location && (
                      <td style={{ ...tdStyle, ...(edit.location_id !== undefined ? changedStyle : {}) }}>
                        {lot ? (
                          <select value={edit.location_id ?? lot.location_id ?? ''} onChange={e => clearEditIfSame(r.id, 'location_id', e.target.value, lot.location_id)}
                            style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px' }}>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                          </select>
                        ) : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
                      </td>
                    )}
                    {cols.stock && (
                      <td style={{ ...tdStyle, ...(edit.current_stock !== undefined ? changedStyle : {}) }}>
                        {lot ? (
                          <select value={edit.current_stock ?? lot.current_stock} onChange={e => clearEditIfSame(r.id, 'current_stock', e.target.value, lot.current_stock)}
                            style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px', width: '80px' }}>
                            {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].map(v => <option key={v} value={v}>{v}%</option>)}
                          </select>
                        ) : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
                      </td>
                    )}
                    {cols.company && (
                      <td style={{ ...tdStyle, ...(edit.company !== undefined ? changedStyle : {}) }}>
                        <CompanyPicker value={edit.company ?? r.company ?? ''} onChange={v => clearEditIfSame(r.id, 'company', v, r.company)}
                          style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px', width: '110px' }} />
                      </td>
                    )}
                    {cols.expiry && <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{lot?.expiry_date || '-'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
