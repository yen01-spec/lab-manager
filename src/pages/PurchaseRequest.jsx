import { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../design'
import { exportPurchaseRequestForm } from '../exportUtils'

let uidCounter = 0
function newId() { uidCounter += 1; return `local-${uidCounter}` }

function emptyReagentItem() {
  return { id: newId(), reagent_id: null, name: '', company: '', cas_no: '', cat_no: '', state: '액체', spec: '', quantity: '1', purpose: '', note: '' }
}
function emptyGoodsItem() {
  return { id: newId(), name: '', spec: '', quantity: '1', unit_price: '', shipping_fee: '', note: '', link: '', purpose: '' }
}

export default function PurchaseRequest() {
  const { student } = useOutletContext?.() || {}
  const [reagentItems, setReagentItems] = useState([emptyReagentItem()])
  const [goodsItems, setGoodsItems] = useState([emptyGoodsItem()])
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [reagentOptions, setReagentOptions] = useState([])
  const searchRef = useRef(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function onClickOutside(e) { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search.trim()) { setReagentOptions([]); return }
      const { data } = await supabase.from('reagents').select('id, name, company, cas_no').ilike('name', `%${search}%`).limit(15)
      setReagentOptions(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  function addReagentFromSearch(r) {
    setReagentItems(items => [...items, { ...emptyReagentItem(), reagent_id: r.id, name: r.name, company: r.company || '', cas_no: r.cas_no || '' }])
    setSearch('')
    setSearchOpen(false)
  }
  function addReagentBlank() {
    setReagentItems(items => [...items, emptyReagentItem()])
  }
  function updateReagentItem(id, field, value) {
    setReagentItems(items => items.map(it => it.id === id ? { ...it, [field]: value } : it))
  }
  function removeReagentItem(id) {
    setReagentItems(items => items.filter(it => it.id !== id))
  }

  function addGoodsItem() { setGoodsItems(items => [...items, emptyGoodsItem()]) }
  function updateGoodsItem(id, field, value) {
    setGoodsItems(items => items.map(it => it.id === id ? { ...it, [field]: value } : it))
  }
  function removeGoodsItem(id) { setGoodsItems(items => items.filter(it => it.id !== id)) }

  function totalOf(it) {
    const unit = Number(it.unit_price) || 0
    const qty = Number(it.quantity) || 0
    const ship = Number(it.shipping_fee) || 0
    return unit * qty + ship
  }

  const validReagentItems = reagentItems.filter(it => it.name.trim())
  const validGoodsItems = goodsItems.filter(it => it.name.trim())
  const goodsTotal = validGoodsItems.reduce((s, it) => s + totalOf(it), 0)
  const shippingTotal = validGoodsItems.reduce((s, it) => s + (Number(it.shipping_fee) || 0), 0)

  async function saveToDb() {
    if (validReagentItems.length === 0 && validGoodsItems.length === 0) { alert('담긴 항목이 없습니다.'); return }
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
    await saveToDb()
    setSaving(false)
    exportPurchaseRequestForm(
      validReagentItems,
      validGoodsItems.map(it => ({ ...it, total_price: totalOf(it) })),
      student?.name,
    )
  }

  async function handlePrint() {
    setSaving(true)
    await saveToDb()
    setSaving(false)
    window.print()
  }

  return (
    <div>
      <PageBanner title="구매요청서 작성" sub="Purchase Request" breadcrumb={['홈', '구매요청서']} />
      <div style={{ padding: '20px 40px' }}>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#EAF1FB', border: '1px solid #C9DAF5', borderRadius: '10px', padding: '10px 16px', marginBottom: '20px', fontSize: '12px', color: '#1F4E96' }}>
          ℹ️ 시약과 물품을 한 요청서에 같이 담을 수 있어요. 승인/발주 상태는 추적하지 않아요 — 내보낸 뒤 담당자에게 전달하세요.
        </div>

        {/* 시약 항목 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: C.navy }}>🧪 시약 항목</span>
            <span style={{ fontSize: '11.5px', color: C.muted, background: '#EEF2FB', padding: '2px 9px', borderRadius: '999px', fontWeight: '600' }}>{validReagentItems.length}건</span>
          </div>
          <div className="no-print" ref={searchRef} style={{ position: 'relative', display: 'flex', gap: '8px' }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)}
              placeholder="시약목록에서 검색해 담기" style={{ ...inputStyle, width: '220px' }} />
            {searchOpen && reagentOptions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', zIndex: 100, background: C.white, border: `1px solid ${C.border}`, borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: '280px', maxHeight: '220px', overflowY: 'auto' }}>
                {reagentOptions.map(r => (
                  <div key={r.id} onMouseDown={() => addReagentFromSearch(r)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontWeight: '600' }}>{r.name}</div>
                    <div style={{ fontSize: '11px', color: C.muted }}>{r.company || '-'} · {r.cas_no || '-'}</div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addReagentBlank} style={{ ...btnGhost, padding: '9px 14px', whiteSpace: 'nowrap' }}>+ 직접 입력</button>
          </div>
        </div>

        <Card noPadding style={{ marginBottom: '24px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr>
                  {['No.', '시약명(제품명)', '회사', 'CAS No.', 'Cat No.', '성상', '규격', '수량', '용도', '비고', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {reagentItems.map((it, idx) => (
                  <tr key={it.id}>
                    <td style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>{idx + 1}</td>
                    <td style={tdStyle}><input value={it.name} onChange={e => updateReagentItem(it.id, 'name', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '160px' }} /></td>
                    <td style={tdStyle}><input value={it.company} onChange={e => updateReagentItem(it.id, 'company', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.cas_no} onChange={e => updateReagentItem(it.id, 'cas_no', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.cat_no} onChange={e => updateReagentItem(it.id, 'cat_no', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}>
                      <select value={it.state} onChange={e => updateReagentItem(it.id, 'state', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: '12.5px', width: '70px' }}>
                        <option>액체</option><option>고체</option><option>기타</option>
                      </select>
                    </td>
                    <td style={tdStyle}><input value={it.spec} onChange={e => updateReagentItem(it.id, 'spec', e.target.value)} placeholder="500 mL" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.quantity} onChange={e => updateReagentItem(it.id, 'quantity', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '50px' }} /></td>
                    <td style={tdStyle}><input value={it.purpose} onChange={e => updateReagentItem(it.id, 'purpose', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '110px' }} /></td>
                    <td style={tdStyle}><input value={it.note} onChange={e => updateReagentItem(it.id, 'note', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '100px' }} /></td>
                    <td className="no-print" style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => removeReagentItem(it.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '14px' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="no-print" style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
            <button onClick={addReagentBlank} style={{ background: '#F9FBFF', color: '#1F4E96', border: '1px dashed #C9DAF5', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>+ 시약 행 추가</button>
          </div>
        </Card>

        {/* 물품 항목 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: C.navy }}>📦 물품 항목</span>
            <span style={{ fontSize: '11.5px', color: C.muted, background: '#EEF2FB', padding: '2px 9px', borderRadius: '999px', fontWeight: '600' }}>{validGoodsItems.length}건</span>
          </div>
          <button className="no-print" onClick={addGoodsItem} style={{ ...btnGhost, padding: '9px 14px' }}>+ 물품 직접 입력</button>
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
                    <td style={tdStyle}><input value={it.name} onChange={e => updateGoodsItem(it.id, 'name', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '160px' }} /></td>
                    <td style={tdStyle}><input value={it.spec} onChange={e => updateGoodsItem(it.id, 'spec', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.quantity} onChange={e => updateGoodsItem(it.id, 'quantity', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '50px' }} /></td>
                    <td style={tdStyle}><input value={it.unit_price} onChange={e => updateGoodsItem(it.id, 'unit_price', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={tdStyle}><input value={it.shipping_fee} onChange={e => updateGoodsItem(it.id, 'shipping_fee', e.target.value)} placeholder="원" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '80px' }} /></td>
                    <td style={{ ...tdStyle, fontWeight: '700', color: C.navy }}>{totalOf(it).toLocaleString()}원</td>
                    <td style={tdStyle}><input value={it.note} onChange={e => updateGoodsItem(it.id, 'note', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', width: '90px' }} /></td>
                    <td style={tdStyle}><input value={it.link} onChange={e => updateGoodsItem(it.id, 'link', e.target.value)} placeholder="구매 링크" style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '110px' }} /></td>
                    <td style={tdStyle}><input value={it.purpose} onChange={e => updateGoodsItem(it.id, 'purpose', e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12.5px', minWidth: '100px' }} /></td>
                    <td className="no-print" style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => removeGoodsItem(it.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '14px' }}>✕</button>
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
          <div className="no-print" style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
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
              <button onClick={handlePrint} disabled={saving} style={{ ...btnPrimary, padding: '10px 18px', opacity: saving ? 0.6 : 1 }}>🖨️ PDF로 저장(인쇄)</button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
