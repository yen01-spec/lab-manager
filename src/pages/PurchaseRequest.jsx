import { useState, useRef } from 'react'
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../design'
import { exportPurchaseRequestForm } from '../exportUtils'
import ReagentAutocomplete from '../components/ReagentAutocomplete'

let uidCounter = 0
function newId() { uidCounter += 1; return `local-${uidCounter}` }

function emptyReagentItem() {
  return {
    id: newId(), reagent_id: null,
    name: '', cas_no: '', state: '액체', needed_amount: '', usage_place: '', purchase_reason: '',
    company: '', cat_no: '', spec: '', quantity: '1', unit_price: '', note: '',
  }
}
function emptyGoodsItem() {
  return { id: newId(), name: '', cat_no: '', spec: '', quantity: '1', unit_price: '', shipping_fee: '', purpose: '', note: '', link: '' }
}
const REQUIRED_REAGENT_FIELDS = [
  ['name', '시약명'], ['cas_no', 'CAS No.'], ['state', '성상'],
  ['needed_amount', '필요용량'], ['usage_place', '사용처'], ['purchase_reason', '구매목적'],
]
function move(list, id, dir) {
  const idx = list.findIndex(it => it.id === id)
  const next = idx + dir
  if (next < 0 || next >= list.length) return list
  const copy = [...list]
  ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
  return copy
}

export default function PurchaseRequest() {
  const { student } = useOutletContext?.() || {}
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const [reagentItems, setReagentItems] = useState(() => {
    const prefill = routerLocation.state?.prefillReagentItems
    if (prefill && prefill.length > 0) return prefill.map(it => ({ ...it, id: newId() }))
    return [emptyReagentItem()]
  })
  const [goodsItems, setGoodsItems] = useState([emptyGoodsItem()])
  const [saving, setSaving] = useState(false)
  const [expandedOptionalIds, setExpandedOptionalIds] = useState(new Set())
  const printRef = useRef(null)

  function toggleOptional(id) {
    setExpandedOptionalIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function updateReagentName(id, value) {
    setReagentItems(items => items.map(it => it.id === id ? { ...it, name: value, reagent_id: null } : it))
  }
  function selectReagentOption(id, r) {
    setReagentItems(items => items.map(it => it.id === id ? { ...it, reagent_id: r.id, name: r.name, company: r.company || '', cas_no: r.cas_no || '' } : it))
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

  function findMissingRequired() {
    for (let i = 0; i < validReagentItems.length; i++) {
      const it = validReagentItems[i]
      for (const [field, label] of REQUIRED_REAGENT_FIELDS) {
        if (!String(it[field] ?? '').trim()) return `시약 항목 ${i + 1}번 행의 "${label}"을(를) 입력해주세요.`
      }
    }
    return null
  }

  async function saveToDb() {
    if (validReagentItems.length === 0 && validGoodsItems.length === 0) { alert('담긴 항목이 없습니다.'); return null }
    const missing = findMissingRequired()
    if (missing) { alert(missing); return null }
    const { data: log, error } = await supabase.from('purchase_request_logs')
      .insert({ requested_by: student?.student_id ?? null }).select().single()
    if (error) { alert('저장 중 오류가 발생했습니다: ' + error.message); return null }
    if (validReagentItems.length > 0) {
      await supabase.from('purchase_request_reagent_items').insert(validReagentItems.map(it => ({
        request_id: log.id, reagent_id: it.reagent_id, name: it.name, cas_no: it.cas_no, state: it.state,
        needed_amount: it.needed_amount, usage_place: it.usage_place, purchase_reason: it.purchase_reason,
        company: it.company, cat_no: it.cat_no, spec: it.spec, quantity: it.quantity, note: it.note,
      })))
    }
    if (validGoodsItems.length > 0) {
      await supabase.from('purchase_request_goods_items').insert(validGoodsItems.map(it => ({
        request_id: log.id, name: it.name, cat_no: it.cat_no, spec: it.spec, quantity: Number(it.quantity) || null,
        unit_price: Number(it.unit_price) || null, shipping_fee: Number(it.shipping_fee) || null,
        total_price: totalOf(it), purpose: it.purpose, note: it.note, link: it.link,
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

  async function handleDownloadPdf() {
    setSaving(true)
    const log = await saveToDb()
    if (!log) { setSaving(false); return }
    // 접혀있는 "원하는 제품이 있는 경우" 항목도 PDF엔 다 나오도록 캡처 직전에 전부 펼쳤다가 되돌린다.
    const prevExpanded = expandedOptionalIds
    setExpandedOptionalIds(new Set(reagentItems.map(it => it.id)))
    await new Promise(r => setTimeout(r, 50))
    const canvas = await html2canvas(printRef.current, {
      scale: 2, backgroundColor: '#ffffff',
      ignoreElements: el => el.classList?.contains('no-print'),
    })
    setExpandedOptionalIds(prevExpanded)
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] })
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
    const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
    pdf.save(`구매요청서_${student?.name || ''}_${dateStr}.pdf`)
    setSaving(false)
  }

  return (
    <div>
      <PageBanner title="구매요청서 작성" sub="Purchase Request" breadcrumb={['홈', '구매요청서']}
        extra={<button onClick={() => navigate('/purchase-request/list')} style={{ ...btnGhost, padding: '9px 16px' }}>📋 요청 목록 보기</button>} />
      <div style={{ padding: '20px 40px' }} ref={printRef}>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#EAF1FB', border: '1px solid #C9DAF5', borderRadius: '10px', padding: '10px 16px', marginBottom: '20px', fontSize: '12px', color: '#1F4E96' }}>
          ℹ️ 시약명 칸에 입력하면 기존 목록에서 자동으로 찾아줘요 — 선택하면 정보가 채워지고, 없는 시약이면 그냥 입력한 이름 그대로 담겨요. 별표(*) 항목은 필수, 나머지는 원하는 제품이 정해진 경우에만 채워주세요. 제출 후 승인/발주 상태는 "요청 목록 보기"에서 확인할 수 있어요.
        </div>

        {/* 시약 항목 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: C.navy }}>🧪 시약 항목</span>
          <span style={{ fontSize: '11.5px', color: C.muted, background: '#EEF2FB', padding: '2px 9px', borderRadius: '999px', fontWeight: '600' }}>{validReagentItems.length}건</span>
        </div>

        <div style={{ marginBottom: '24px' }}>
          {reagentItems.map((it, idx) => {
            const isCustomState = it.state !== '액체' && it.state !== '고체'
            const fieldLabel = { fontSize: '10.5px', color: C.muted, marginBottom: '3px', fontWeight: '600' }
            const fieldBox = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: '110px' }
            return (
              <div key={it.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12.5px', color: C.navy, fontWeight: '700' }}>No.{idx + 1}</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: C.muted }}>필수 입력</span>
                  <span className="no-print" style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
                    <button onClick={() => moveReagentItem(it.id, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? '#D5D9E0' : C.muted, cursor: idx === 0 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▲</button>
                    <button onClick={() => moveReagentItem(it.id, 1)} disabled={idx === reagentItems.length - 1} style={{ background: 'none', border: 'none', color: idx === reagentItems.length - 1 ? '#D5D9E0' : C.muted, cursor: idx === reagentItems.length - 1 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▼</button>
                    <button onClick={() => removeReagentItem(it.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '14px', padding: '2px' }}>✕</button>
                  </span>
                </div>

                {/* 1행: 필수 입력 */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div style={{ ...fieldBox, minWidth: '180px' }}>
                    <label style={fieldLabel}>시약명 *</label>
                    <ReagentAutocomplete
                      value={it.name}
                      onChange={v => updateReagentName(it.id, v)}
                      onSelect={r => selectReagentOption(it.id, r)}
                      placeholder="시약명 또는 CAS No. 입력 (자동 검색)"
                      inputStyle={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                    {it.reagent_id && <span style={{ fontSize: '9.5px', color: '#1F4E96', background: '#EAF1FB', padding: '1px 6px', borderRadius: '5px', marginTop: '3px', display: 'inline-block', alignSelf: 'flex-start' }}>목록에서 담김</span>}
                  </div>
                  <div style={fieldBox}>
                    <label style={fieldLabel}>CAS No. *</label>
                    <input value={it.cas_no} onChange={e => updateReagentItem(it.id, 'cas_no', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                  </div>
                  <div style={fieldBox}>
                    <label style={fieldLabel}>성상 *</label>
                    <select value={isCustomState ? '직접입력' : it.state} onChange={e => updateReagentItem(it.id, 'state', e.target.value === '직접입력' ? '' : e.target.value)}
                      style={{ ...inputStyle, padding: '6px 6px', fontSize: '12.5px' }}>
                      <option>액체</option><option>고체</option><option>직접입력</option>
                    </select>
                    {isCustomState && (
                      <input value={it.state} onChange={e => updateReagentItem(it.id, 'state', e.target.value)} placeholder="직접 입력"
                        style={{ ...inputStyle, padding: '4px 6px', fontSize: '11.5px', marginTop: '4px' }} />
                    )}
                  </div>
                  <div style={fieldBox}>
                    <label style={fieldLabel}>필요용량 *</label>
                    <input value={it.needed_amount} onChange={e => updateReagentItem(it.id, 'needed_amount', e.target.value)} placeholder="500mL 이상" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                  </div>
                  <div style={fieldBox}>
                    <label style={fieldLabel}>사용처 *</label>
                    <input value={it.usage_place} onChange={e => updateReagentItem(it.id, 'usage_place', e.target.value)} placeholder="예) 유기합성 실험" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                  </div>
                  <div style={fieldBox}>
                    <label style={fieldLabel}>구매목적 *</label>
                    <input value={it.purchase_reason} onChange={e => updateReagentItem(it.id, 'purchase_reason', e.target.value)} placeholder="예) 재고 소진" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                  </div>
                </div>

                {/* 2행: 원하는 제품이 있는 경우 — 기본은 접혀있고 클릭하면 펼침 */}
                <div style={{ borderTop: `1px dashed ${C.border}`, paddingTop: '10px' }}>
                  <button className="no-print" onClick={() => toggleOptional(it.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: '6px', marginBottom: expandedOptionalIds.has(it.id) ? '8px' : 0,
                  }}>
                    <span style={{ fontSize: '11px', color: C.muted }}>{expandedOptionalIds.has(it.id) ? '▾' : '▸'}</span>
                    <span style={{ fontSize: '10.5px', fontWeight: '700', color: C.muted }}>원하는 제품이 있는 경우</span>
                    {totalOf(it) > 0 && <span style={{ fontSize: '11px', fontWeight: '700', color: C.blueDark }}>· {totalOf(it).toLocaleString()}원</span>}
                  </button>
                  {expandedOptionalIds.has(it.id) && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ ...fieldBox, minWidth: '110px' }}>
                        <label style={fieldLabel}>회사</label>
                        <input value={it.company} onChange={e => updateReagentItem(it.id, 'company', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                      </div>
                      <div style={{ ...fieldBox, minWidth: '110px' }}>
                        <label style={fieldLabel}>Cat No.</label>
                        <input value={it.cat_no} onChange={e => updateReagentItem(it.id, 'cat_no', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                      </div>
                      <div style={{ ...fieldBox, minWidth: '90px' }}>
                        <label style={fieldLabel}>규격</label>
                        <input value={it.spec} onChange={e => updateReagentItem(it.id, 'spec', e.target.value)} placeholder="500 mL" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                      </div>
                      <div style={{ ...fieldBox, minWidth: '60px', maxWidth: '70px' }}>
                        <label style={fieldLabel}>수량</label>
                        <input value={it.quantity} onChange={e => updateReagentItem(it.id, 'quantity', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                      </div>
                      <div style={{ ...fieldBox, minWidth: '90px' }}>
                        <label style={fieldLabel}>단가</label>
                        <input value={it.unit_price} onChange={e => updateReagentItem(it.id, 'unit_price', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                      </div>
                      <div style={{ ...fieldBox, minWidth: '140px' }}>
                        <label style={fieldLabel}>비고</label>
                        <input value={it.note} onChange={e => updateReagentItem(it.id, 'note', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '12.5px' }} />
                      </div>
                      <div style={{ marginLeft: 'auto', textAlign: 'right', paddingBottom: '7px' }}>
                        <div style={{ fontSize: '10.5px', color: C.muted }}>총가격</div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy }}>{totalOf(it).toLocaleString()}원</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '700', color: C.textSub }}>시약 합계: <span style={{ color: C.blueDark }}>{reagentTotal.toLocaleString()}원</span></span>
            <button onClick={addReagentBlank} style={{ background: '#F9FBFF', color: '#1F4E96', border: '1px dashed #C9DAF5', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>+ 시약 행 추가</button>
          </div>
        </div>

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
                  {['No.', '제품명', 'Cat No.', '규격', '수량', '단가', '배송비', '총가격', '용도', '비고', '링크', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {goodsItems.map((it, idx) => (
                  <tr key={it.id}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>{idx + 1}</td>
                    <td style={tdStyle}><input value={it.name} onChange={e => updateGoodsItem(it.id, 'name', e.target.value)} placeholder="제품명 입력" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '160px' }} /></td>
                    <td style={tdStyle}><input value={it.cat_no} onChange={e => updateGoodsItem(it.id, 'cat_no', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.spec} onChange={e => updateGoodsItem(it.id, 'spec', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.quantity} onChange={e => updateGoodsItem(it.id, 'quantity', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '50px' }} /></td>
                    <td style={tdStyle}><input value={it.unit_price} onChange={e => updateGoodsItem(it.id, 'unit_price', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.shipping_fee} onChange={e => updateGoodsItem(it.id, 'shipping_fee', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={{ ...tdStyle, fontWeight: '700', color: C.navy }}>{totalOf(it).toLocaleString()}원</td>
                    <td style={tdStyle}><input value={it.purpose} onChange={e => updateGoodsItem(it.id, 'purpose', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '100px' }} /></td>
                    <td style={tdStyle}><input value={it.note} onChange={e => updateGoodsItem(it.id, 'note', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.link} onChange={e => updateGoodsItem(it.id, 'link', e.target.value)} placeholder="구매 링크" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '110px' }} /></td>
                    <td className="no-print" style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => moveGoodsItem(it.id, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? '#D5D9E0' : C.muted, cursor: idx === 0 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▲</button>
                      <button onClick={() => moveGoodsItem(it.id, 1)} disabled={idx === goodsItems.length - 1} style={{ background: 'none', border: 'none', color: idx === goodsItems.length - 1 ? '#D5D9E0' : C.muted, cursor: idx === goodsItems.length - 1 ? 'default' : 'pointer', fontSize: '13px', padding: '2px' }}>▼</button>
                      <button onClick={() => removeGoodsItem(it.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '14px', padding: '2px' }}>✕</button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', color: C.textSub, background: C.bg }}>합계</td>
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
              <button onClick={handleExportExcel} disabled={saving} style={{ ...btnGhost, padding: '10px 18px', opacity: saving ? 0.6 : 1 }}>📊 Excel로 내보내기</button>
              <button onClick={handleDownloadPdf} disabled={saving} style={{ ...btnPrimary, padding: '10px 18px', opacity: saving ? 0.6 : 1 }}>📄 PDF로 저장</button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
