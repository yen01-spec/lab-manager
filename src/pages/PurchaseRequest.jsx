import { useState, useRef } from 'react'
import { useOutletContext, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, Modal, inputStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../design'
import { exportPurchaseRequestForm } from '../exportUtils'

let uidCounter = 0
function newId() { uidCounter += 1; return `local-${uidCounter}` }

function emptyReagentItem() {
  return { id: newId(), reagent_id: null, name: '', company: '', cas_no: '', cat_no: '', state: '액체', spec: '', quantity: '1', unit_price: '', purpose: '', note: '' }
}
function emptyGoodsItem() {
  return { id: newId(), name: '', spec: '', quantity: '1', unit_price: '', shipping_fee: '', note: '', link: '', purpose: '' }
}
function move(list, id, dir) {
  const idx = list.findIndex(it => it.id === id)
  const next = idx + dir
  if (next < 0 || next >= list.length) return list
  const copy = [...list]
  ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
  return copy
}

function highlightMatch(text, query) {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <b style={{ color: C.blueDark }}>{text.slice(idx, idx + query.trim().length)}</b>
      {text.slice(idx + query.trim().length)}
    </>
  )
}

export default function PurchaseRequest() {
  const { student } = useOutletContext?.() || {}
  const routerLocation = useLocation()
  const [reagentItems, setReagentItems] = useState(() => {
    const prefill = routerLocation.state?.prefillReagentItems
    if (prefill && prefill.length > 0) return prefill.map(it => ({ ...it, id: newId() }))
    return [emptyReagentItem()]
  })
  const [goodsItems, setGoodsItems] = useState([emptyGoodsItem()])
  const [activeRow, setActiveRow] = useState(null)
  const [rowOptions, setRowOptions] = useState([])
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  function handleNameInput(id, value) {
    setReagentItems(items => items.map(it => it.id === id ? { ...it, name: value, reagent_id: null } : it))
    setActiveRow(id)
    setHighlightIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setRowOptions([]); return }
    const myRequestId = ++requestIdRef.current
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('reagents').select('id, name, company, cas_no').ilike('name', `%${value}%`).limit(8)
      if (requestIdRef.current === myRequestId) setRowOptions(data || [])
    }, 200)
  }
  function handleFocusRow(id) {
    setActiveRow(id)
    setRowOptions([])
    setHighlightIdx(-1)
  }
  function selectRowOption(id, r) {
    setReagentItems(items => items.map(it => it.id === id ? { ...it, reagent_id: r.id, name: r.name, company: r.company || '', cas_no: r.cas_no || '' } : it))
    setActiveRow(null)
    setRowOptions([])
    setHighlightIdx(-1)
  }
  function closeDropdownSoon(id) {
    setTimeout(() => setActiveRow(prev => (prev === id ? null : prev)), 150)
  }
  function handleNameKeyDown(id, e) {
    if (rowOptions.length === 0 || activeRow !== id) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, rowOptions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      selectRowOption(id, rowOptions[highlightIdx])
    } else if (e.key === 'Escape') {
      setActiveRow(null); setRowOptions([])
    }
  }

  function addReagentBlank() { setReagentItems(items => [...items, emptyReagentItem()]) }
  function updateReagentItem(id, field, value) {
    setReagentItems(items => items.map(it => it.id === id ? { ...it, [field]: value } : it))
  }
  function removeReagentItem(id) { setReagentItems(items => items.filter(it => it.id !== id)) }
  function moveReagentItem(id, dir) { setReagentItems(items => move(items, id, dir)) }

  function addGoodsItem() { setGoodsItems(items => [...items, emptyGoodsItem()]) }
  function updateGoodsItem(id, field, value) {
    setGoodsItems(items => items.map(it => it.id === id ? { ...it, [field]: value } : it))
  }
  function removeGoodsItem(id) { setGoodsItems(items => items.filter(it => it.id !== id)) }
  function moveGoodsItem(id, dir) { setGoodsItems(items => move(items, id, dir)) }

  function totalOf(it) {
    const unit = Number(it.unit_price) || 0
    const qty = Number(it.quantity) || 0
    const ship = Number(it.shipping_fee) || 0
    return unit * qty + ship
  }

  const validReagentItems = reagentItems.filter(it => it.name.trim())
  const validGoodsItems = goodsItems.filter(it => it.name.trim())
  const reagentTotal = validReagentItems.reduce((s, it) => s + totalOf(it), 0)
  const goodsTotal = validGoodsItems.reduce((s, it) => s + totalOf(it), 0)
  const shippingTotal = validGoodsItems.reduce((s, it) => s + (Number(it.shipping_fee) || 0), 0)

  async function saveToDb() {
    if (validReagentItems.length === 0 && validGoodsItems.length === 0) { alert('담긴 항목이 없습니다.'); return null }
    const { data: log, error } = await supabase.from('purchase_request_logs')
      .insert({ requested_by: student?.student_id ?? null }).select().single()
    if (error) { alert('저장 중 오류가 발생했습니다: ' + error.message); return null }
    if (validReagentItems.length > 0) {
      await supabase.from('purchase_request_reagent_items').insert(validReagentItems.map(it => ({
        request_id: log.id, reagent_id: it.reagent_id, name: it.name, company: it.company, cas_no: it.cas_no,
        cat_no: it.cat_no, state: it.state, spec: it.spec, quantity: it.quantity, purpose: it.purpose, note: it.note,
      })))
    }
    if (validGoodsItems.length > 0) {
      await supabase.from('purchase_request_goods_items').insert(validGoodsItems.map(it => ({
        request_id: log.id, name: it.name, spec: it.spec, quantity: Number(it.quantity) || null,
        unit_price: Number(it.unit_price) || null, shipping_fee: Number(it.shipping_fee) || null,
        total_price: totalOf(it), note: it.note, link: it.link, purpose: it.purpose,
      })))
    }
    return log
  }

  async function handleExportExcel() {
    setSaving(true)
    const log = await saveToDb()
    setSaving(false)
    if (!log) return
    exportPurchaseRequestForm(
      validReagentItems,
      validGoodsItems.map(it => ({ ...it, total_price: totalOf(it) })),
      student?.name,
    )
  }

  async function handlePrint() {
    setSaving(true)
    const log = await saveToDb()
    setSaving(false)
    if (!log) return
    window.print()
  }

  return (
    <div>
      <PageBanner title="구매요청서 작성" sub="Purchase Request" breadcrumb={['홈', '구매요청서']} />
      <div style={{ padding: '20px 40px' }}>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#EAF1FB', border: '1px solid #C9DAF5', borderRadius: '10px', padding: '10px 16px', marginBottom: '20px', fontSize: '12px', color: '#1F4E96' }}>
          ℹ️ 시약명 칸에 입력하면 기존 목록에서 자동으로 찾아줘요 — 선택하면 정보가 채워지고, 없는 시약이면 그냥 입력한 이름 그대로 담겨요. 승인/발주 상태는 추적하지 않아요.
        </div>

        {/* 시약 항목 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: C.navy }}>🧪 시약 항목</span>
          <span style={{ fontSize: '11.5px', color: C.muted, background: '#EEF2FB', padding: '2px 9px', borderRadius: '999px', fontWeight: '600' }}>{validReagentItems.length}건</span>
        </div>

        <Card noPadding style={{ marginBottom: '24px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1150px' }}>
              <thead>
                <tr>
                  {['No.', '시약명(제품명)', '회사', 'CAS No.', 'Cat No.', '성상', '규격', '수량', '단가', '총가격', '용도', '비고', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {reagentItems.map((it, idx) => {
                  const isCustomState = it.state !== '액체' && it.state !== '고체'
                  return (
                  <tr key={it.id}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, position: 'relative' }}>
                      <input
                        value={it.name}
                        onChange={e => handleNameInput(it.id, e.target.value)}
                        onFocus={() => handleFocusRow(it.id)}
                        onBlur={() => closeDropdownSoon(it.id)}
                        onKeyDown={e => handleNameKeyDown(it.id, e)}
                        placeholder="시약명 입력 (자동 검색)"
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '160px' }} />
                      {it.reagent_id && <span style={{ fontSize: '9.5px', color: '#1F4E96', background: '#EAF1FB', padding: '1px 6px', borderRadius: '5px', marginTop: '2px', display: 'inline-block' }}>목록에서 담김</span>}
                      {activeRow === it.id && rowOptions.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 8, zIndex: 100, background: C.white, border: `1px solid ${C.border}`, borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: '260px', maxHeight: '220px', overflowY: 'auto' }}>
                          {rowOptions.map((r, i) => (
                            <div key={r.id} onMouseDown={() => selectRowOption(it.id, r)}
                              onMouseEnter={e => { e.currentTarget.style.background = C.blueTint }}
                              onMouseLeave={e => { e.currentTarget.style.background = i === highlightIdx ? C.blueTint : C.white }}
                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: `1px solid ${C.border}`, background: i === highlightIdx ? C.blueTint : C.white }}>
                              <div style={{ fontWeight: '600' }}>{highlightMatch(r.name, it.name)}</div>
                              <div style={{ fontSize: '11px', color: C.muted }}>{r.company || '-'} · {r.cas_no || '-'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}><input value={it.company} onChange={e => updateReagentItem(it.id, 'company', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.cas_no} onChange={e => updateReagentItem(it.id, 'cas_no', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.cat_no} onChange={e => updateReagentItem(it.id, 'cat_no', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}>
                      <select value={isCustomState ? '직접입력' : it.state} onChange={e => updateReagentItem(it.id, 'state', e.target.value === '직접입력' ? '' : e.target.value)}
                        style={{ ...inputStyle, padding: '5px 6px', fontSize: '12.5px', width: '80px' }}>
                        <option>액체</option><option>고체</option><option>직접입력</option>
                      </select>
                      {isCustomState && (
                        <input value={it.state} onChange={e => updateReagentItem(it.id, 'state', e.target.value)} placeholder="직접 입력"
                          style={{ ...inputStyle, padding: '4px 6px', fontSize: '11.5px', width: '80px', marginTop: '4px' }} />
                      )}
                    </td>
                    <td style={tdStyle}><input value={it.spec} onChange={e => updateReagentItem(it.id, 'spec', e.target.value)} placeholder="500 mL" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.quantity} onChange={e => updateReagentItem(it.id, 'quantity', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '50px' }} /></td>
                    <td style={tdStyle}><input value={it.unit_price} onChange={e => updateReagentItem(it.id, 'unit_price', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={{ ...tdStyle, fontWeight: '700', color: C.navy, whiteSpace: 'nowrap' }}>{totalOf(it).toLocaleString()}원</td>
                    <td style={tdStyle}><input value={it.purpose} onChange={e => updateReagentItem(it.id, 'purpose', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '110px' }} /></td>
                    <td style={tdStyle}><input value={it.note} onChange={e => updateReagentItem(it.id, 'note', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '100px' }} /></td>
                    <td className="no-print" style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => moveReagentItem(it.id, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? '#D5D9E0' : C.muted, cursor: idx === 0 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▲</button>
                      <button onClick={() => moveReagentItem(it.id, 1)} disabled={idx === reagentItems.length - 1} style={{ background: 'none', border: 'none', color: idx === reagentItems.length - 1 ? '#D5D9E0' : C.muted, cursor: idx === reagentItems.length - 1 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▼</button>
                      <button onClick={() => removeReagentItem(it.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '14px', padding: '2px' }}>✕</button>
                    </td>
                  </tr>
                )})}
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', color: C.textSub, background: C.bg }}>합계</td>
                  <td style={{ ...tdStyle, background: C.bg, fontWeight: '700', color: C.blueDark, whiteSpace: 'nowrap' }}>{reagentTotal.toLocaleString()}원</td>
                  <td colSpan={3} style={{ background: C.bg }}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="no-print" style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addReagentBlank} style={{ background: '#F9FBFF', color: '#1F4E96', border: '1px dashed #C9DAF5', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>+ 시약 행 추가</button>
          </div>
        </Card>

        {/* 물품 항목 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: C.navy }}>📦 물품 항목</span>
          <span style={{ fontSize: '11.5px', color: C.muted, background: '#EEF2FB', padding: '2px 9px', borderRadius: '999px', fontWeight: '600' }}>{validGoodsItems.length}건</span>
        </div>

        <Card noPadding style={{ marginBottom: '24px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr>
                  {['No.', '제품명', '규격', '수량', '단가', '배송비', '총가격', '비고', '링크', '용도', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {goodsItems.map((it, idx) => (
                  <tr key={it.id}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>{idx + 1}</td>
                    <td style={tdStyle}><input value={it.name} onChange={e => updateGoodsItem(it.id, 'name', e.target.value)} placeholder="제품명 입력" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '160px' }} /></td>
                    <td style={tdStyle}><input value={it.spec} onChange={e => updateGoodsItem(it.id, 'spec', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.quantity} onChange={e => updateGoodsItem(it.id, 'quantity', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '50px' }} /></td>
                    <td style={tdStyle}><input value={it.unit_price} onChange={e => updateGoodsItem(it.id, 'unit_price', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.shipping_fee} onChange={e => updateGoodsItem(it.id, 'shipping_fee', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={{ ...tdStyle, fontWeight: '700', color: C.navy }}>{totalOf(it).toLocaleString()}원</td>
                    <td style={tdStyle}><input value={it.note} onChange={e => updateGoodsItem(it.id, 'note', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.link} onChange={e => updateGoodsItem(it.id, 'link', e.target.value)} placeholder="구매 링크" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '110px' }} /></td>
                    <td style={tdStyle}><input value={it.purpose} onChange={e => updateGoodsItem(it.id, 'purpose', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '100px' }} /></td>
                    <td className="no-print" style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => moveGoodsItem(it.id, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? '#D5D9E0' : C.muted, cursor: idx === 0 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▲</button>
                      <button onClick={() => moveGoodsItem(it.id, 1)} disabled={idx === goodsItems.length - 1} style={{ background: 'none', border: 'none', color: idx === goodsItems.length - 1 ? '#D5D9E0' : C.muted, cursor: idx === goodsItems.length - 1 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▼</button>
                      <button onClick={() => removeGoodsItem(it.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '14px', padding: '2px' }}>✕</button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', color: C.textSub, background: C.bg }}>합계</td>
                  <td style={{ ...tdStyle, background: C.bg }}></td>
                  <td style={{ ...tdStyle, background: C.bg, fontWeight: '700' }}>{shippingTotal.toLocaleString()}원</td>
                  <td style={{ ...tdStyle, background: C.bg, fontWeight: '700', color: C.blueDark }}>{goodsTotal.toLocaleString()}원</td>
                  <td colSpan={4} style={{ background: C.bg }}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="no-print" style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addGoodsItem} style={{ background: '#F9FBFF', color: '#1F4E96', border: '1px dashed #C9DAF5', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>+ 물품 행 추가</button>
          </div>
        </Card>

        {/* 요청자 정보 + 내보내기 */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>요청자: {student?.name || '-'} {student?.student_id ? `(${student.student_id})` : ''}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>{new Date().toLocaleDateString('ko-KR')} 작성 · 시약 {validReagentItems.length}건 · 물품 {validGoodsItems.length}건</div>
            </div>
            <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowPreview(true)} style={{ ...btnGhost, padding: '10px 18px' }}>👁️ 미리보기</button>
              <button onClick={handleExportExcel} disabled={saving} style={{ ...btnGhost, padding: '10px 18px', opacity: saving ? 0.6 : 1 }}>📊 Excel로 내보내기</button>
              <button onClick={handlePrint} disabled={saving} style={{ ...btnPrimary, padding: '10px 18px', opacity: saving ? 0.6 : 1 }}>🖨️ PDF로 저장(인쇄)</button>
            </div>
          </div>
        </Card>
      </div>

      {showPreview && (
        <Modal open={showPreview} onClose={() => setShowPreview(false)} title="구매요청서 미리보기" width={860}>
          <div style={{ marginBottom: '8px', fontSize: '12px', color: C.muted }}>요청자: {student?.name || '-'} · {new Date().toLocaleDateString('ko-KR')}</div>

          <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy, margin: '14px 0 8px' }}>🧪 시약 항목 ({validReagentItems.length}건)</div>
          {validReagentItems.length === 0 ? (
            <div style={{ fontSize: '12px', color: C.muted, padding: '8px 0' }}>담긴 시약이 없습니다.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
              <thead><tr>{['No.', '시약명', '회사', 'CAS No.', '성상', '규격', '수량', '단가', '총가격', '용도'].map(h => <th key={h} style={{ ...thStyle, fontSize: '11px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {validReagentItems.map((it, i) => (
                  <tr key={it.id}>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', fontWeight: '600' }}>{it.name}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.company || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.cas_no || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.state || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.spec || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.quantity}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{Number(it.unit_price || 0).toLocaleString()}원</td>
                    <td style={{ ...tdStyle, fontSize: '12px', fontWeight: '700' }}>{totalOf(it).toLocaleString()}원</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.purpose || '-'}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', fontSize: '12px' }}>합계</td>
                  <td style={{ ...tdStyle, fontWeight: '700', fontSize: '12px', color: C.blueDark }}>{reagentTotal.toLocaleString()}원</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          )}

          <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy, margin: '14px 0 8px' }}>📦 물품 항목 ({validGoodsItems.length}건)</div>
          {validGoodsItems.length === 0 ? (
            <div style={{ fontSize: '12px', color: C.muted, padding: '8px 0' }}>담긴 물품이 없습니다.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['No.', '제품명', '규격', '수량', '단가', '배송비', '총가격', '용도'].map(h => <th key={h} style={{ ...thStyle, fontSize: '11px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {validGoodsItems.map((it, i) => (
                  <tr key={it.id}>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', fontWeight: '600' }}>{it.name}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.spec || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.quantity}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{Number(it.unit_price || 0).toLocaleString()}원</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{Number(it.shipping_fee || 0).toLocaleString()}원</td>
                    <td style={{ ...tdStyle, fontSize: '12px', fontWeight: '700' }}>{totalOf(it).toLocaleString()}원</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{it.purpose || '-'}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', fontSize: '12px' }}>합계</td>
                  <td style={{ ...tdStyle, fontWeight: '700', fontSize: '12px' }}>{shippingTotal.toLocaleString()}원</td>
                  <td style={{ ...tdStyle, fontWeight: '700', fontSize: '12px', color: C.blueDark }}>{goodsTotal.toLocaleString()}원</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <button onClick={() => setShowPreview(false)} style={{ ...btnGhost, padding: '9px 16px' }}>닫기</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
