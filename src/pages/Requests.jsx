import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, StatusBadge, inputStyle, labelStyle, btnPrimary, thStyle, tdStyle } from '../design'

export default function Requests() {
  const { isAdmin } = useOutletContext()
  const [myName, setMyName] = useState(() => localStorage.getItem('req_user_name') || '')
  const [reagents, setReagents] = useState([])
  const [items, setItems] = useState([])
  const [requestType, setRequestType] = useState('reagent') // 'reagent' | 'item'

  // 시약 폼
  const initReagentForm = {
    user_name: myName,
    target_name: '', cas_no: '', quantity: '', usage_place: '', purpose: '',
    company: '', product_name: '', product_volume: '', unit_price: '',
    shipping_cost: '', total_price: '', product_link: '', notes: '',
  }
  const [reagentForm, setReagentForm] = useState(initReagentForm)
  const [showOptional, setShowOptional] = useState(false)

  // 물품 폼
  const initItemForm = {
    user_name: myName,
    target_name: '', spec: '', quantity: '', unit_price: '',
    shipping_cost: '', total_price: '', product_link: '',
    usage_place: '', purpose: '', notes: '',
  }
  const [itemForm, setItemForm] = useState(initItemForm)

  // 시약 타이핑 검색
  const [reagentSearch, setReagentSearch] = useState('')
  const [showReagentDropdown, setShowReagentDropdown] = useState(false)

  const [myRequests, setMyRequests] = useState([])
  const [myRequestsLoaded, setMyRequestsLoaded] = useState(false)

  // 중복 감지
  const [duplicates, setDuplicates] = useState([])
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    fetchReagents(); fetchItems()
    if (myName) fetchMyRequests(myName)
  }, [])

  useEffect(() => {
    if (reagentForm.user_name) localStorage.setItem('req_user_name', reagentForm.user_name)
  }, [reagentForm.user_name])

  useEffect(() => {
    if (itemForm.user_name) localStorage.setItem('req_user_name', itemForm.user_name)
  }, [itemForm.user_name])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { checkDuplicate() }, 400)
  }, [reagentForm.target_name, itemForm.target_name, requestType])

  async function checkDuplicate() {
    const name = requestType === 'reagent' ? reagentForm.target_name : itemForm.target_name
    if (!name?.trim()) { setDuplicates([]); return }
    const { data } = await supabase.from('purchase_requests').select('*')
      .in('status', ['pending', 'approved', 'ordered', 'delivered'])
      .ilike('target_name', `%${name.trim()}%`)
    setDuplicates(data || [])
  }

  async function fetchReagents() {
    const { data } = await supabase.from('reagents').select('id, name, cas_no')
    if (data) setReagents(data)
  }
  async function fetchItems() {
    const { data } = await supabase.from('items').select('id, name')
    if (data) setItems(data)
  }
  async function fetchMyRequests(name) {
    if (!name?.trim()) return
    const { data } = await supabase.from('purchase_requests').select('*')
      .eq('user_name', name.trim()).order('created_at', { ascending: false })
    if (data) { setMyRequests(data); setMyRequestsLoaded(true) }
  }

  async function submitReagentRequest() {
    const f = reagentForm
    if (!f.user_name.trim()) { alert('이름을 입력해주세요'); return }
    if (!f.target_name.trim()) { alert('시약명을 입력해주세요'); return }
    if (!f.quantity.trim()) { alert('필요 용량/수량을 입력해주세요'); return }
    if (!f.usage_place.trim()) { alert('사용처를 입력해주세요'); return }
    if (!f.purpose.trim()) { alert('구매목적을 입력해주세요'); return }

    if (duplicates.length > 0) { setShowDuplicateModal(true); return }

    await supabase.from('purchase_requests').insert({
      user_name: f.user_name, target_type: 'reagent',
      target_name: f.target_name, quantity: f.quantity,
      cas_no: f.cas_no, company: f.company,
      product_name: f.product_name, product_volume: f.product_volume,
      unit_price: f.unit_price, shipping_cost: f.shipping_cost,
      total_price: f.total_price, product_link: f.product_link,
      usage_place: f.usage_place, purpose: f.purpose, notes: f.notes,
    })

    supabase.functions.invoke('send-notification', {
      body: {
        title: '🧪 새 시약 구매 요청',
        body: `${f.user_name}님이 ${f.target_name} 구매를 요청했습니다.`,
        role: 'admin',
      }
    }).catch(() => {})

    alert('구매 요청이 접수되었습니다!')
    const name = f.user_name
    setReagentForm({ ...initReagentForm, user_name: name })
    setReagentSearch('')
    setShowOptional(false)
    setDuplicates([])
    fetchMyRequests(name)
  }

  async function submitItemRequest() {
    const f = itemForm
    if (!f.user_name.trim()) { alert('이름을 입력해주세요'); return }
    if (!f.target_name.trim()) { alert('제품명을 입력해주세요'); return }
    if (!f.quantity.trim()) { alert('필요 수량을 입력해주세요'); return }
    if (!f.usage_place.trim()) { alert('사용처를 입력해주세요'); return }
    if (!f.purpose.trim()) { alert('구매목적을 입력해주세요'); return }

    if (duplicates.length > 0) { setShowDuplicateModal(true); return }

    await supabase.from('purchase_requests').insert({
      user_name: f.user_name, target_type: 'item',
      target_name: f.target_name, quantity: f.quantity,
      spec: f.spec, unit_price: f.unit_price,
      shipping_cost: f.shipping_cost, total_price: f.total_price,
      product_link: f.product_link, usage_place: f.usage_place,
      purpose: f.purpose, notes: f.notes,
    })

    supabase.functions.invoke('send-notification', {
      body: {
        title: '📦 새 물품 구매 요청',
        body: `${f.user_name}님이 ${f.target_name} 구매를 요청했습니다.`,
        role: 'admin',
      }
    }).catch(() => {})

    alert('구매 요청이 접수되었습니다!')
    const name = f.user_name
    setItemForm({ ...initItemForm, user_name: name })
    setDuplicates([])
    fetchMyRequests(name)
  }

  const statusKo = { pending: '대기중', approved: '승인됨', ordered: '발주완료', delivered: '배송완료', rejected: '반려' }

  const currentName = requestType === 'reagent' ? reagentForm.user_name : itemForm.user_name

  return (
    <div>
      <PageBanner title="구매 요청" sub="Purchase Request" breadcrumb={['홈', '구매 요청']} />

      <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 요청 타입 선택 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {[['reagent', '🧪 시약 주문'], ['item', '📦 기타 물품 주문']].map(([type, label]) => (
            <button key={type} onClick={() => setRequestType(type)} style={{
              padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '14px', fontWeight: '700',
              background: requestType === type ? C.navy : C.white,
              color: requestType === type ? C.white : C.text,
              border: `1px solid ${requestType === type ? C.navy : C.border}`,
            }}>{label}</button>
          ))}
        </div>

        {/* 시약 주문 폼 */}
        {requestType === 'reagent' && (
          <Card title="🧪 시약 구매 요청" sub="Reagent Purchase Request">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* 신청자 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>신청자 이름 *</label>
                <input value={reagentForm.user_name}
                  onChange={e => setReagentForm({ ...reagentForm, user_name: e.target.value })}
                  placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
              </div>

              {/* 시약명 - 타이핑 검색 */}
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>시약명 *</label>
                <input
                  value={reagentSearch}
                  onChange={e => {
                    setReagentSearch(e.target.value)
                    setReagentForm({ ...reagentForm, target_name: e.target.value, cas_no: '' })
                    setShowReagentDropdown(true)
                  }}
                  onFocus={() => setShowReagentDropdown(true)}
                  onBlur={() => setTimeout(() => setShowReagentDropdown(false), 150)}
                  placeholder="시약명 또는 CAS번호 입력..."
                  style={inputStyle} />
                {showReagentDropdown && reagentSearch && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: '#fff', border: `1px solid ${C.border}`, borderRadius: '8px',
                    maxHeight: '200px', overflowY: 'auto',
                    boxShadow: '0 4px 16px rgba(26,42,94,0.12)', marginTop: '2px',
                  }}>
                    {reagents.filter(r =>
                      r.name.toLowerCase().includes(reagentSearch.toLowerCase()) ||
                      (r.cas_no && r.cas_no.includes(reagentSearch))
                    ).slice(0, 20).map(r => (
                      <div key={r.id}
                        onMouseDown={() => {
                          setReagentSearch(r.name)
                          setReagentForm({ ...reagentForm, target_name: r.name, cas_no: r.cas_no || '' })
                          setShowReagentDropdown(false)
                        }}
                        style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', borderBottom: `1px solid ${C.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <span style={{ fontWeight: '600', color: C.navy }}>{r.name}</span>
                        {r.cas_no && <span style={{ color: C.muted, fontSize: '11px', marginLeft: '8px' }}>{r.cas_no}</span>}
                      </div>
                    ))}
                    {reagents.filter(r =>
                      r.name.toLowerCase().includes(reagentSearch.toLowerCase()) ||
                      (r.cas_no && r.cas_no.includes(reagentSearch))
                    ).length === 0 && (
                      <div
                        onMouseDown={() => {
                          setReagentForm({ ...reagentForm, target_name: reagentSearch })
                          setShowReagentDropdown(false)
                        }}
                        style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: C.muted }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        "{reagentSearch}" 신규 입력
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CAS번호 */}
              <div>
                <label style={labelStyle}>CAS번호 *</label>
                <input value={reagentForm.cas_no}
                  onChange={e => setReagentForm({ ...reagentForm, cas_no: e.target.value })}
                  placeholder="예: 64-17-5" style={inputStyle} />
              </div>

              {/* 필요 용량/수량 */}
              <div>
                <label style={labelStyle}>필요 용량/수량 *</label>
                <input value={reagentForm.quantity}
                  onChange={e => setReagentForm({ ...reagentForm, quantity: e.target.value })}
                  placeholder="예: 500mL 2개" style={inputStyle} />
              </div>

              {/* 사용처 */}
              <div>
                <label style={labelStyle}>사용처 *</label>
                <input value={reagentForm.usage_place}
                  onChange={e => setReagentForm({ ...reagentForm, usage_place: e.target.value })}
                  placeholder="예: 유기합성실험" style={inputStyle} />
              </div>

              {/* 구매목적 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>구매목적 *</label>
                <input value={reagentForm.purpose}
                  onChange={e => setReagentForm({ ...reagentForm, purpose: e.target.value })}
                  placeholder="예: 졸업논문 실험용" style={inputStyle} />
              </div>
            </div>

            {/* 중복 감지 배너 */}
            {duplicates.length > 0 && reagentForm.target_name && (
              <div style={{ marginTop: '16px', padding: '12px 16px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400E', marginBottom: '2px' }}>진행 중인 요청이 있습니다</div>
                  {duplicates.slice(0, 2).map(d => (
                    <div key={d.id} style={{ fontSize: '12px', color: '#B45309' }}>
                      {d.target_name} — 요청자: {d.user_name}, 수량: {d.quantity}, 상태: {statusKo[d.status] || d.status}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 선택 입력 토글 */}
            <div style={{ marginTop: '20px' }}>
              <button onClick={() => setShowOptional(!showOptional)} style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: '6px',
                padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: C.muted,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {showOptional ? '▲' : '▼'} 원하는 제품 정보 입력 (선택)
              </button>
            </div>

            {showOptional && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px', padding: '16px', background: C.bg, borderRadius: '8px' }}>
                <div>
                  <label style={labelStyle}>회사명</label>
                  <input value={reagentForm.company}
                    onChange={e => setReagentForm({ ...reagentForm, company: e.target.value })}
                    placeholder="예: Sigma-Aldrich" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>제품명</label>
                  <input value={reagentForm.product_name}
                    onChange={e => setReagentForm({ ...reagentForm, product_name: e.target.value })}
                    placeholder="예: Ethanol ≥99.8%" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>제품 용량</label>
                  <input value={reagentForm.product_volume}
                    onChange={e => setReagentForm({ ...reagentForm, product_volume: e.target.value })}
                    placeholder="예: 1L" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>제품 단가</label>
                  <input value={reagentForm.unit_price}
                    onChange={e => setReagentForm({ ...reagentForm, unit_price: e.target.value })}
                    placeholder="예: 50,000원" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>배송비</label>
                  <input value={reagentForm.shipping_cost}
                    onChange={e => setReagentForm({ ...reagentForm, shipping_cost: e.target.value })}
                    placeholder="예: 3,000원" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>총 주문 가격</label>
                  <input value={reagentForm.total_price}
                    onChange={e => setReagentForm({ ...reagentForm, total_price: e.target.value })}
                    placeholder="예: 103,000원" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>제품 링크</label>
                  <input value={reagentForm.product_link}
                    onChange={e => setReagentForm({ ...reagentForm, product_link: e.target.value })}
                    placeholder="https://..." style={inputStyle} />
                </div>
              </div>
            )}

            {/* 비고 */}
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>비고</label>
              <textarea value={reagentForm.notes}
                onChange={e => setReagentForm({ ...reagentForm, notes: e.target.value })}
                placeholder="기타 요청사항이나 전달사항을 입력하세요" rows={3}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <button onClick={submitReagentRequest} style={{ ...btnPrimary, marginTop: '16px' }}>요청 제출</button>
          </Card>
        )}

        {/* 기타 물품 주문 폼 */}
        {requestType === 'item' && (
          <Card title="📦 기타 물품 구매 요청" sub="Item Purchase Request">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>신청자 이름 *</label>
                <input value={itemForm.user_name}
                  onChange={e => setItemForm({ ...itemForm, user_name: e.target.value })}
                  placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
              </div>

              <div>
                <label style={labelStyle}>제품명 *</label>
                <input value={itemForm.target_name}
                  onChange={e => setItemForm({ ...itemForm, target_name: e.target.value })}
                  placeholder="예: 라텍스 장갑" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>규격/단위 *</label>
                <input value={itemForm.spec}
                  onChange={e => setItemForm({ ...itemForm, spec: e.target.value })}
                  placeholder="예: M size / box" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>필요 수량 *</label>
                <input value={itemForm.quantity}
                  onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })}
                  placeholder="예: 2box" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>단가 *</label>
                <input value={itemForm.unit_price}
                  onChange={e => setItemForm({ ...itemForm, unit_price: e.target.value })}
                  placeholder="예: 15,000원" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>배송비 *</label>
                <input value={itemForm.shipping_cost}
                  onChange={e => setItemForm({ ...itemForm, shipping_cost: e.target.value })}
                  placeholder="예: 3,000원 / 무료" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>총 주문 가격 *</label>
                <input value={itemForm.total_price}
                  onChange={e => setItemForm({ ...itemForm, total_price: e.target.value })}
                  placeholder="예: 33,000원" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>사용처 *</label>
                <input value={itemForm.usage_place}
                  onChange={e => setItemForm({ ...itemForm, usage_place: e.target.value })}
                  placeholder="예: 303호 실험실" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>구매목적 *</label>
                <input value={itemForm.purpose}
                  onChange={e => setItemForm({ ...itemForm, purpose: e.target.value })}
                  placeholder="예: 실험용 소모품" style={inputStyle} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>제품 링크 *</label>
                <input value={itemForm.product_link}
                  onChange={e => setItemForm({ ...itemForm, product_link: e.target.value })}
                  placeholder="https://..." style={inputStyle} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>비고</label>
                <textarea value={itemForm.notes}
                  onChange={e => setItemForm({ ...itemForm, notes: e.target.value })}
                  placeholder="기타 요청사항이나 전달사항을 입력하세요" rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>

            {/* 중복 감지 배너 */}
            {duplicates.length > 0 && itemForm.target_name && (
              <div style={{ marginTop: '16px', padding: '12px 16px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400E', marginBottom: '2px' }}>진행 중인 요청이 있습니다</div>
                  {duplicates.slice(0, 2).map(d => (
                    <div key={d.id} style={{ fontSize: '12px', color: '#B45309' }}>
                      {d.target_name} — 요청자: {d.user_name}, 수량: {d.quantity}, 상태: {statusKo[d.status] || d.status}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={submitItemRequest} style={{ ...btnPrimary, marginTop: '16px' }}>요청 제출</button>
          </Card>
        )}

        {/* 내 요청 현황 */}
        {!isAdmin && (
          <Card title="내 요청 현황" sub="My Requests"
            extra={
              <button onClick={() => fetchMyRequests(currentName)} style={{
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px',
                padding: '5px 14px', cursor: 'pointer', fontSize: '12px', color: C.muted,
              }}>새로고침</button>
            }>
            {!myRequestsLoaded ? (
              <div style={{ textAlign: 'center', padding: '24px', color: C.muted, fontSize: '13px' }}>
                이름을 입력하고 새로고침을 눌러 요청 현황을 확인하세요.
              </div>
            ) : myRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: C.muted, fontSize: '13px' }}>
                요청 내역이 없습니다.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['요청일', '종류', '항목', '수량', '상태', '비고'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {myRequests.map(req => (
                    <tr key={req.id}>
                      <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(req.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '11px', background: req.target_type === 'reagent' ? '#EBF8FF' : '#F0FFF4', color: req.target_type === 'reagent' ? '#2B6CB0' : '#276749', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
                          {req.target_type === 'reagent' ? '시약' : '물품'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: '600' }}>{req.target_name || '-'}</td>
                      <td style={tdStyle}>{req.quantity}</td>
                      <td style={tdStyle}><StatusBadge status={req.status} /></td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {req.status === 'rejected' && req.reject_note
                          ? <span style={{ color: C.danger }}>반려 사유: {req.reject_note}</span>
                          : req.status === 'ordered' && req.ordered_at
                          ? <span>
                              발주일: {new Date(req.ordered_at).toLocaleDateString()}
                              {req.tracking_number && <span> · 운송장: <strong>{req.tracking_number}</strong></span>}
                              {req.estimated_arrival && <span> · 예상도착: <strong>{req.estimated_arrival}</strong></span>}
                            </span>
                          : req.status === 'delivered' && req.delivered_at
                          ? `배송완료: ${new Date(req.delivered_at).toLocaleDateString()}`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>

      {/* 중복 감지 모달 */}
      {showDuplicateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '480px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: C.navy }}>중복 요청 감지</div>
                <div style={{ fontSize: '13px', color: C.muted }}>이미 진행 중인 요청이 있습니다</div>
              </div>
            </div>
            <div style={{ background: C.bg, borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', border: `1px solid ${C.border}` }}>
              {duplicates.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                  <div>
                    <span style={{ fontWeight: '600', color: C.navy }}>{d.target_name}</span>
                    <span style={{ color: C.muted, marginLeft: '8px' }}>수량: {d.quantity}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: C.muted, fontSize: '12px' }}>{d.user_name}</span>
                    <StatusBadge status={d.status} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => { requestType === 'reagent' ? submitReagentRequest() : submitItemRequest(); setShowDuplicateModal(false) }} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: C.navy, color: C.white, cursor: 'pointer', fontSize: '14px', fontWeight: '700', textAlign: 'left' }}>
                📋 별도 요청으로 진행
                <div style={{ fontSize: '11px', fontWeight: '400', opacity: 0.8, marginTop: '2px' }}>기존 요청과 별개로 새 요청을 제출합니다</div>
              </button>
              <button onClick={() => setShowDuplicateModal(false)} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.white, color: C.muted, cursor: 'pointer', fontSize: '13px' }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
