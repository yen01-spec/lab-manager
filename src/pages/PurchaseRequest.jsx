import { useState, useRef } from 'react'
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, labelStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../design'
import { exportPurchaseRequestForm } from '../exportUtils'
import ReagentAutocomplete from '../components/ReagentAutocomplete'

let uidCounter = 0
function newId() { uidCounter += 1; return `local-${uidCounter}` }

function emptyReagentDraft() {
  return {
    reagent_id: null, name: '', cas_no: '', needed_amount: '', usage_place: '', purchase_reason: '', note: '',
    company: '', cat_no: '', spec: '', quantity: '1',
  }
}
function emptyGoodsDraft() {
  return { name: '', cat_no: '', spec: '', quantity: '1', unit_price: '', shipping_fee: '0', purpose: '', note: '', link: '' }
}
// 시약 항목에는 가격 필드가 없음 — 요청만 하고 가격은 담당자가 처리하는 구조
const REQUIRED_REAGENT_FIELDS = [
  ['name', '화학물질명'], ['cas_no', 'CAS No.'], ['needed_amount', '필요한 용량'],
  ['usage_place', '사용처'], ['purchase_reason', '용도'], ['note', '비고'],
]
const REQUIRED_GOODS_FIELDS = [['name', '제품명'], ['quantity', '수량'], ['unit_price', '단가']]

const fieldGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }
function Field({ label, required, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}{required && ' *'}</label>
      {children}
    </div>
  )
}

export default function PurchaseRequest() {
  const { student } = useOutletContext?.() || {}
  const routerLocation = useLocation()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('reagent') // 'reagent' | 'goods'
  const [reagentItems, setReagentItems] = useState(() => {
    const prefill = routerLocation.state?.prefillReagentItems
    if (prefill && prefill.length > 0) return prefill.map(it => ({ ...emptyReagentDraft(), ...it, id: newId(), wants_product: !!(it.company || it.cat_no || it.spec) }))
    return []
  })
  const [goodsItems, setGoodsItems] = useState([])
  const [reagentDraft, setReagentDraft] = useState(emptyReagentDraft())
  const [goodsDraft, setGoodsDraft] = useState(emptyGoodsDraft())
  const [wantsProduct, setWantsProduct] = useState(false)
  const [editingReagentId, setEditingReagentId] = useState(null)
  const [editingGoodsId, setEditingGoodsId] = useState(null)
  const [listTab, setListTab] = useState('reagent') // 하단 목록 탭: 화면에선 하나씩만 보여주되, 내보내기 땐 둘 다 포함
  const [exportCapture, setExportCapture] = useState(false) // PDF 캡처 중엔 두 목록을 강제로 같이 렌더링
  const [saving, setSaving] = useState(false)
  const printRef = useRef(null)

  // ── 시약 폼 ──
  function updateReagentDraft(field, value) {
    setReagentDraft(d => ({ ...d, [field]: value, ...(field === 'name' ? { reagent_id: null } : {}) }))
  }
  function selectReagentOption(r) {
    setReagentDraft(d => ({ ...d, reagent_id: r.id, name: r.name, cas_no: r.cas_no || '', company: r.company || '' }))
    setWantsProduct(true) // DB에서 특정 제품을 찾았으니 원하는 제품 섹션을 자동으로 열어줌
  }
  function resetReagentDraft() {
    setReagentDraft(emptyReagentDraft())
    setWantsProduct(false)
    setEditingReagentId(null)
  }
  function startEditReagent(item) {
    setActiveTab('reagent')
    setReagentDraft({ ...item })
    setWantsProduct(!!item.wants_product)
    setEditingReagentId(item.id)
  }
  function submitReagent() {
    for (const [field, label] of REQUIRED_REAGENT_FIELDS) {
      if (!String(reagentDraft[field] ?? '').trim()) { alert(`"${label}"을(를) 입력해주세요.`); return }
    }
    const finalized = {
      ...reagentDraft,
      company: wantsProduct ? reagentDraft.company : '',
      cat_no: wantsProduct ? reagentDraft.cat_no : '',
      spec: wantsProduct ? reagentDraft.spec : '',
      quantity: wantsProduct ? (reagentDraft.quantity || '1') : '',
      wants_product: wantsProduct,
    }
    if (editingReagentId) {
      setReagentItems(items => items.map(it => it.id === editingReagentId ? { ...finalized, id: editingReagentId } : it))
    } else {
      setReagentItems(items => [...items, { ...finalized, id: newId() }])
    }
    resetReagentDraft()
  }
  function deleteReagentItem(id) {
    if (!window.confirm('이 시약 항목을 목록에서 삭제할까요?')) return
    setReagentItems(items => items.filter(it => it.id !== id))
    if (editingReagentId === id) resetReagentDraft()
  }

  // ── 물품 폼 ──
  function updateGoodsDraft(field, value) { setGoodsDraft(d => ({ ...d, [field]: value })) }
  function resetGoodsDraft() { setGoodsDraft(emptyGoodsDraft()); setEditingGoodsId(null) }
  function startEditGoods(item) {
    setActiveTab('goods')
    setGoodsDraft({ ...item })
    setEditingGoodsId(item.id)
  }
  function submitGoods() {
    for (const [field, label] of REQUIRED_GOODS_FIELDS) {
      if (!String(goodsDraft[field] ?? '').trim()) { alert(`"${label}"을(를) 입력해주세요.`); return }
    }
    if (editingGoodsId) {
      setGoodsItems(items => items.map(it => it.id === editingGoodsId ? { ...goodsDraft, id: editingGoodsId } : it))
    } else {
      setGoodsItems(items => [...items, { ...goodsDraft, id: newId() }])
    }
    resetGoodsDraft()
  }
  function deleteGoodsItem(id) {
    if (!window.confirm('이 물품 항목을 목록에서 삭제할까요?')) return
    setGoodsItems(items => items.filter(it => it.id !== id))
    if (editingGoodsId === id) resetGoodsDraft()
  }

  function totalOf(it) {
    const unit = Number(it.unit_price) || 0
    const qty = Number(it.quantity) || 0
    const ship = Number(it.shipping_fee) || 0
    return unit * qty + ship
  }

  const goodsTotal = goodsItems.reduce((s, it) => s + totalOf(it), 0)
  const shippingTotal = goodsItems.reduce((s, it) => s + (Number(it.shipping_fee) || 0), 0)
  const reagentDraftHasContent = reagentDraft.name.trim() || reagentDraft.cas_no.trim() || reagentDraft.needed_amount.trim() || reagentDraft.usage_place.trim() || reagentDraft.purchase_reason.trim() || reagentDraft.note.trim()
  const goodsDraftHasContent = goodsDraft.name.trim() || goodsDraft.unit_price.trim()

  async function saveToDb() {
    if (reagentItems.length === 0 && goodsItems.length === 0) { alert('담긴 항목이 없습니다.'); return null }
    const { data: log, error } = await supabase.from('purchase_request_logs')
      .insert({ requested_by: student?.student_id ?? null }).select().single()
    if (error) { alert('저장 중 오류가 발생했습니다: ' + error.message); return null }
    if (reagentItems.length > 0) {
      await supabase.from('purchase_request_reagent_items').insert(reagentItems.map(it => ({
        request_id: log.id, reagent_id: it.reagent_id, name: it.name, cas_no: it.cas_no, state: null,
        needed_amount: it.needed_amount, usage_place: it.usage_place, purchase_reason: it.purchase_reason,
        company: it.company, cat_no: it.cat_no, spec: it.spec, quantity: it.quantity, note: it.note,
      })))
    }
    if (goodsItems.length > 0) {
      await supabase.from('purchase_request_goods_items').insert(goodsItems.map(it => ({
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
      reagentItems,
      goodsItems.map(it => ({ ...it, total_price: totalOf(it) })),
      student?.name,
    )
  }

  async function handleDownloadPdf() {
    setSaving(true)
    const log = await saveToDb()
    if (!log) { setSaving(false); return }
    // 화면에선 탭으로 하나씩만 보여주지만, PDF엔 시약목록+물품목록이 항상 같이 들어가야 하므로
    // 캡처 직전에만 두 목록을 강제로 같이 렌더링한다.
    setExportCapture(true)
    await new Promise(r => setTimeout(r, 60))
    const canvas = await html2canvas(printRef.current, {
      scale: 2, backgroundColor: '#ffffff',
      ignoreElements: el => el.classList?.contains('no-print'),
    })
    setExportCapture(false)
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] })
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
    const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
    pdf.save(`구매요청서_${student?.name || ''}_${dateStr}.pdf`)
    setSaving(false)
  }

  const editingReagentItem = editingReagentId ? reagentItems.find(it => it.id === editingReagentId) : null
  const editingGoodsItem = editingGoodsId ? goodsItems.find(it => it.id === editingGoodsId) : null

  return (
    <div>
      <PageBanner title="구매요청서 작성" sub="Purchase Request" breadcrumb={['홈', '구매요청서']}
        extra={<button onClick={() => navigate('/purchase-request/list')} style={{ ...btnGhost, padding: '9px 16px' }}>📋 요청 목록 보기</button>} />
      <div style={{ padding: '20px 40px' }} ref={printRef}>

        {/* ── ① 상단: 탭 + 입력 폼 ── */}
        <div className="no-print">
        <Card style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${C.border}` }}>
            {[['reagent', '시약 주문', reagentDraftHasContent], ['goods', '물품 주문', goodsDraftHasContent]].map(([key, label, hasContent]) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '13.5px', fontFamily: 'inherit', fontWeight: activeTab === key ? 700 : 500,
                color: activeTab === key ? C.blueDark : C.muted,
                borderBottom: activeTab === key ? `2px solid ${C.blue}` : '2px solid transparent',
                marginBottom: '-1px',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {label}
                {hasContent && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: activeTab === key ? C.blue : C.warning, display: 'inline-block' }} />}
              </button>
            ))}
          </div>

          {activeTab === 'reagent' && editingReagentItem && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#FBF0DF', border: '1px solid #F0DBAE', borderRadius: '8px', padding: '9px 14px', marginBottom: '16px', fontSize: '12.5px', color: '#8A5A16' }}>
              ✎ 목록의 "{editingReagentItem.name}" 항목을 수정 중입니다
              <button onClick={resetReagentDraft} style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '11.5px', border: `1px solid ${C.border}`, background: C.white, borderRadius: '6px', cursor: 'pointer' }}>수정 취소</button>
            </div>
          )}
          {activeTab === 'goods' && editingGoodsItem && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#FBF0DF', border: '1px solid #F0DBAE', borderRadius: '8px', padding: '9px 14px', marginBottom: '16px', fontSize: '12.5px', color: '#8A5A16' }}>
              ✎ 목록의 "{editingGoodsItem.name}" 항목을 수정 중입니다
              <button onClick={resetGoodsDraft} style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '11.5px', border: `1px solid ${C.border}`, background: C.white, borderRadius: '6px', cursor: 'pointer' }}>수정 취소</button>
            </div>
          )}

          {activeTab === 'reagent' ? (
            <>
              <div style={{ fontSize: '11.5px', color: C.muted, marginBottom: '10px' }}>필수 항목</div>
              <div style={fieldGridStyle}>
                <Field label="화학물질명" required>
                  <ReagentAutocomplete
                    value={reagentDraft.name}
                    onChange={v => updateReagentDraft('name', v)}
                    onSelect={selectReagentOption}
                    placeholder="화학물질명 또는 CAS No. 입력"
                    inputStyle={inputStyle} />
                </Field>
                <Field label="CAS No." required>
                  <input value={reagentDraft.cas_no} onChange={e => updateReagentDraft('cas_no', e.target.value)}
                    readOnly={!!reagentDraft.reagent_id} style={{ ...inputStyle, background: reagentDraft.reagent_id ? C.bg : C.white }} />
                </Field>
                <Field label="필요한 용량" required>
                  <input value={reagentDraft.needed_amount} onChange={e => updateReagentDraft('needed_amount', e.target.value)} placeholder="500mL 이상" style={inputStyle} />
                </Field>
                <Field label="사용처" required>
                  <input value={reagentDraft.usage_place} onChange={e => updateReagentDraft('usage_place', e.target.value)} placeholder="예) 분석화학실험" style={inputStyle} />
                </Field>
                <Field label="용도" required>
                  <input value={reagentDraft.purchase_reason} onChange={e => updateReagentDraft('purchase_reason', e.target.value)} placeholder="예) 적정 실험용" style={inputStyle} />
                </Field>
                <Field label="비고" required>
                  <input value={reagentDraft.note} onChange={e => updateReagentDraft('note', e.target.value)} style={inputStyle} />
                </Field>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '18px 0 4px', paddingTop: '14px', borderTop: `1px solid ${C.border}`, fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={wantsProduct} onChange={e => setWantsProduct(e.target.checked)} />
                원하는 제품이 있어요
              </label>
              {wantsProduct && (
                <>
                  <div style={{ fontSize: '11.5px', color: C.muted, marginBottom: '10px' }}>체크 시에만 아래 제품 정보 입력 (선택)</div>
                  <div style={{ ...fieldGridStyle, background: C.bg, borderRadius: '8px', padding: '14px' }}>
                    <Field label="제조사">
                      <input value={reagentDraft.company} onChange={e => updateReagentDraft('company', e.target.value)}
                        readOnly={!!reagentDraft.reagent_id} style={{ ...inputStyle, background: reagentDraft.reagent_id ? '#EEF0F3' : C.white }} />
                    </Field>
                    <Field label="Cat No.">
                      <input value={reagentDraft.cat_no} onChange={e => updateReagentDraft('cat_no', e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="규격">
                      <input value={reagentDraft.spec} onChange={e => updateReagentDraft('spec', e.target.value)} placeholder="예) 500 mL" style={inputStyle} />
                    </Field>
                    <Field label="수량">
                      <input type="number" min="1" value={reagentDraft.quantity} onChange={e => updateReagentDraft('quantity', e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
                <button onClick={submitReagent} style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  border: `1px solid ${editingReagentId ? C.warning : C.blue}`,
                  background: editingReagentId ? '#FFF8E7' : '#EAF1FB',
                  color: editingReagentId ? '#92400E' : C.blue,
                }}>{editingReagentId ? '💾 저장 (수정 완료)' : '+ 목록에 추가'}</button>
              </div>
            </>
          ) : (
            <>
              <div style={fieldGridStyle}>
                <Field label="제품명" required>
                  <input value={goodsDraft.name} onChange={e => updateGoodsDraft('name', e.target.value)} placeholder="제품명 입력" style={inputStyle} />
                </Field>
                <Field label="Cat No.">
                  <input value={goodsDraft.cat_no} onChange={e => updateGoodsDraft('cat_no', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="규격">
                  <input value={goodsDraft.spec} onChange={e => updateGoodsDraft('spec', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="수량" required>
                  <input type="number" min="1" value={goodsDraft.quantity} onChange={e => updateGoodsDraft('quantity', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="단가" required>
                  <input type="number" min="0" value={goodsDraft.unit_price} onChange={e => updateGoodsDraft('unit_price', e.target.value)} placeholder="원" style={inputStyle} />
                </Field>
                <Field label="배송비">
                  <input type="number" min="0" value={goodsDraft.shipping_fee} onChange={e => updateGoodsDraft('shipping_fee', e.target.value)} placeholder="원" style={inputStyle} />
                </Field>
                <Field label="용도">
                  <input value={goodsDraft.purpose} onChange={e => updateGoodsDraft('purpose', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="비고">
                  <input value={goodsDraft.note} onChange={e => updateGoodsDraft('note', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="구매 링크">
                  <input value={goodsDraft.link} onChange={e => updateGoodsDraft('link', e.target.value)} placeholder="구매 링크" style={inputStyle} />
                </Field>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginTop: '10px' }}>
                총가격(자동 계산): <b style={{ color: C.navy }}>{totalOf(goodsDraft).toLocaleString()}원</b> = 단가 × 수량 + 배송비
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                <button onClick={submitGoods} style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  border: `1px solid ${editingGoodsId ? C.warning : C.blue}`,
                  background: editingGoodsId ? '#FFF8E7' : '#EAF1FB',
                  color: editingGoodsId ? '#92400E' : C.blue,
                }}>{editingGoodsId ? '💾 저장 (수정 완료)' : '+ 목록에 추가'}</button>
              </div>
            </>
          )}
        </Card>
        </div>

        {/* ── ② 하단: 시약/물품 목록 — 탭으로 전환해서 보되, 내보내기엔 항상 둘 다 포함됨 ── */}
        <Card noPadding style={{ marginBottom: '24px' }}>
          <div className="no-print" style={{ display: 'flex', gap: '4px', padding: '0 16px', borderBottom: `1px solid ${C.border}` }}>
            {[['reagent', '시약 목록', reagentItems.length], ['goods', '물품 목록', goodsItems.length]].map(([key, label, count]) => (
              <button key={key} onClick={() => setListTab(key)} style={{
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '13.5px', fontFamily: 'inherit', fontWeight: listTab === key ? 700 : 500,
                color: listTab === key ? C.blueDark : C.muted,
                borderBottom: listTab === key ? `2px solid ${C.blue}` : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {label}
                <span style={{ fontSize: '11px', color: listTab === key ? C.blue : C.muted, background: listTab === key ? '#EAF1FB' : '#EEF1F6', padding: '1px 7px', borderRadius: '999px', fontWeight: '600' }}>{count}</span>
              </button>
            ))}
          </div>

          {(listTab === 'reagent' || exportCapture) && (
            <>
              {exportCapture && <div style={{ padding: '14px 16px 0', fontSize: '13px', fontWeight: '700', color: C.navy }}>🧪 시약 목록</div>}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['화학물질명', '필요용량', '사용처', '제조사', '규격', '수량', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {reagentItems.length === 0 ? (
                      <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: '24px' }}>담긴 시약이 없습니다. 위 폼에서 입력 후 "목록에 추가"를 눌러주세요.</td></tr>
                    ) : reagentItems.map(it => (
                      <tr key={it.id} style={{ background: editingReagentId === it.id ? '#FBF0DF' : 'transparent' }}>
                        <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{it.name}</td>
                        <td style={{ ...tdStyle, color: C.muted }}>{it.needed_amount}</td>
                        <td style={{ ...tdStyle, color: C.muted }}>{it.usage_place}</td>
                        <td style={tdStyle}>{it.wants_product ? (it.company || '-') : '-'}</td>
                        <td style={tdStyle}>{it.wants_product ? (it.spec || '-') : '-'}</td>
                        <td style={tdStyle}>{it.wants_product ? (it.quantity || '-') : '-'}</td>
                        <td className="no-print" style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button onClick={() => startEditReagent(it)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' }} title="수정">✎</button>
                          <button onClick={() => deleteReagentItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' }} title="삭제">🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`, fontSize: '11px', color: C.muted, textAlign: 'right' }}>
                가격 정보 없음 · "-" = 원하는 제품 미지정
              </div>
            </>
          )}

          {(listTab === 'goods' || exportCapture) && (
            <>
              {exportCapture && <div style={{ padding: '18px 16px 0', fontSize: '13px', fontWeight: '700', color: C.navy, borderTop: `1px solid ${C.border}` }}>📦 물품 목록</div>}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['제품명', '규격', '수량', '단가', '배송비', '총가격', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {goodsItems.length === 0 ? (
                      <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: C.muted, padding: '24px' }}>담긴 물품이 없습니다. 위 폼에서 입력 후 "목록에 추가"를 눌러주세요.</td></tr>
                    ) : goodsItems.map(it => (
                      <tr key={it.id} style={{ background: editingGoodsId === it.id ? '#FBF0DF' : 'transparent' }}>
                        <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{it.name}</td>
                        <td style={{ ...tdStyle, color: C.muted }}>{it.spec || '-'}</td>
                        <td style={tdStyle}>{it.quantity}</td>
                        <td style={tdStyle}>{(Number(it.unit_price) || 0).toLocaleString()}원</td>
                        <td style={tdStyle}>{(Number(it.shipping_fee) || 0).toLocaleString()}원</td>
                        <td style={{ ...tdStyle, fontWeight: '700', color: C.navy }}>{totalOf(it).toLocaleString()}원</td>
                        <td className="no-print" style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button onClick={() => startEditGoods(it)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' }} title="수정">✎</button>
                          <button onClick={() => deleteGoodsItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' }} title="삭제">🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`, fontSize: '11px', color: C.muted, textAlign: 'right' }}>
                총가격 = 단가 × 수량 + 배송비 (자동 계산) · 배송비 합계: {shippingTotal.toLocaleString()}원 · 물품 합계: <b style={{ color: C.blueDark }}>{goodsTotal.toLocaleString()}원</b>
              </div>
            </>
          )}
        </Card>

        {/* 요청자 정보 + 내보내기 */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>요청자: {student?.name || '-'} {student?.student_id ? `(${student.student_id})` : ''}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>{new Date().toLocaleDateString('ko-KR')} 작성 · 시약 {reagentItems.length}건 · 물품 {goodsItems.length}건</div>
              <div className="no-print" style={{ fontSize: '11px', color: C.blue, marginTop: '4px' }}>📎 시약 목록과 물품 목록이 하나의 파일로 함께 내보내집니다</div>
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
