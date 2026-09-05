import { useEffect, useRef, useState } from 'react'
import { useParams, useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, inputStyle, labelStyle, btnPrimary, btnGhost } from '../design'
import CompanyPicker from '../components/CompanyPicker'

// 국가유해물질정보(KECO) GHS 조회 API가 주는 공식 픽토그램 코드(pctgrmCd) → 표시용 매핑.
// 예전엔 hazard 텍스트에서 키워드를 추측해서 이모지를 붙였는데, 이 API 응답에 이미
// 정확한 GHS01~09 코드가 와 있어서(예: "GHS02^GHS07^GHS08") 그걸 그대로 쓴다.
const GHS_PICTOGRAM_MAP = {
  GHS01: { emoji: '💥', label: '폭발성' },
  GHS02: { emoji: '🔥', label: '인화성' },
  GHS03: { emoji: '🔥', label: '산화성' },
  GHS04: { emoji: '🫧', label: '고압가스' },
  GHS05: { emoji: '🧪', label: '부식성' },
  GHS06: { emoji: '💀', label: '급성독성' },
  GHS07: { emoji: '⚠️', label: '유해성·자극성' },
  GHS08: { emoji: '☣️', label: '건강유해성' },
  GHS09: { emoji: '🌊', label: '환경유해성' },
}
function getGhsPictograms(codes) {
  if (!codes) return []
  return codes.split('^').filter(Boolean).map(code => ({ code, ...(GHS_PICTOGRAM_MAP[code] || { emoji: '❓', label: code }) }))
}

const FIELD_LABELS = {
  name: '시약명', cas_no: 'CAS 번호', company: '제조사', category: '성상', volume: '용량', unit: '단위', hazard: '유해정보',
  manager: '담당자', msds_url: 'MSDS URL', notes: '비고',
}

function InfoRow({ label, value, sourceBadge }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '13.5px', color: C.text }}>{value || '-'} {sourceBadge}</div>
    </div>
  )
}

export default function ReagentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, student } = useOutletContext?.() || {}

  const [reagent, setReagent] = useState(null)
  const [lots, setLots] = useState([])
  const [pendingChanges, setPendingChanges] = useState([])
  const [confirmedByName, setConfirmedByName] = useState('')
  const [registeredByName, setRegisteredByName] = useState('')
  const [disposalPending, setDisposalPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploadingMsds, setUploadingMsds] = useState(false)
  const [activeInventorySession, setActiveInventorySession] = useState(null)

  const [editMode, setEditMode] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [inlineEdit, setInlineEdit] = useState(null)

  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalForm, setDisposalForm] = useState({ lot_id: '', quantity: '1', reason: '' })
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveForm, setMoveForm] = useState({ lot_id: '', to_location_id: '', notes: '' })
  const [showAddLotModal, setShowAddLotModal] = useState(false)
  const [addLotForm, setAddLotForm] = useState({ lot_no: '', cat_no: '', sealed_count: '1', current_stock: '100', location_id: '', received_date: new Date().toISOString().split('T')[0], expiry_date: '' })
  const [locations, setLocations] = useState([])
  const [history, setHistory] = useState([])
  // 상단 버튼이 6개까지 늘어나던 걸 정리 — 자주 쓰는 재고등록/위치이동(+실사 중이면
  // 정보맞음)만 항상 보이고, 나머지(폐기신청/정보수정/시약삭제)는 "⋯더보기" 안으로.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => { fetchAll() }, [id])
  useEffect(() => { supabase.from('locations').select('*').order('room').then(({ data }) => data && setLocations(data)) }, [])
  useEffect(() => {
    supabase.from('inventory_sessions').select('*').in('status', ['active', 'paused']).limit(1)
      .then(({ data }) => setActiveInventorySession(data?.[0] || null))
  }, [])

  async function fetchAll() {
    const { data } = await supabase.from('reagents')
      .select('*, locations(*), reagent_lots(*)').eq('id', id).single()
    if (!data) { setLoading(false); return }
    setReagent(data)
    setLots(data.reagent_lots || [])
    fetchPendingChanges()

    // DB 조회 3개는 서로 독립적이라 순차로 기다릴 필요 없이 한번에 병렬 실행
    const [{ data: cs }, { data: rs }, { data: disposal }] = await Promise.all([
      data.confirmed_by ? supabase.from('students').select('name').eq('student_id', data.confirmed_by).maybeSingle() : Promise.resolve({ data: null }),
      data.registered_by ? supabase.from('students').select('name').eq('student_id', data.registered_by).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('disposal_requests').select('*').eq('reagent_id', id).eq('status', 'pending').maybeSingle(),
    ])
    setConfirmedByName(data.confirmed_by ? (cs?.name || data.confirmed_by) : '')
    setRegisteredByName(data.registered_by ? (rs?.name || data.registered_by) : '')
    setDisposalPending(disposal || null)
    fetchHistory()

    // 여기서 로딩을 끝냄 — 아래 CAS/GHS 외부 공공 API 조회는 느릴 수 있어(초 단위) 화면을
    // 붙잡아두지 않고 백그라운드에서 계속 돌리다가 끝나면 결과만 반영한다.
    setLoading(false)
    enrichCasAndHazard(data)
  }

  async function enrichCasAndHazard(data) {
    let casForLookup = data.cas_no
    if (!casForLookup && data.name) {
      // CAS 번호가 비어있으면 PubChem에서 시약명으로 CID를 찾고, 그 동의어 목록에서 CAS 형식 값을 추출
      try {
        const cidRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(data.name)}/cids/JSON`)
        if (cidRes.ok) {
          const cidData = await cidRes.json()
          const cid = cidData?.IdentifierList?.CID?.[0]
          if (cid) {
            const synRes = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`)
            if (synRes.ok) {
              const synData = await synRes.json()
              const syns = synData?.InformationList?.Information?.[0]?.Synonym || []
              const foundCas = syns.find(s => /^\d{2,7}-\d{2}-\d$/.test(s))
              if (foundCas) {
                casForLookup = foundCas
                await supabase.from('reagents').update({ cas_no: foundCas, cas_source: 'auto_ghs' }).eq('id', id)
                setReagent(prev => ({ ...prev, cas_no: foundCas, cas_source: 'auto_ghs' }))
              }
            }
          }
        }
      } catch { /* PubChem 조회 실패 시 무시 — CAS 없이 계속 진행 */ }
    }

    if (casForLookup) {
      try {
        const GHS_KEY = 'e9bf2e5bc508d370a9660687c34a6730eae5237e78bad04e08f66705be15d597'
        const ghsRes = await fetch(
          `https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList?serviceKey=${GHS_KEY}&searchGubun=2&searchNm=${encodeURIComponent(casForLookup)}&pageNo=1&numOfRows=1&returnType=JSON`
        )
        if (ghsRes.ok) {
          const ghsData = await ghsRes.json()
          const items = ghsData?.body?.items
          const first = Array.isArray(items) ? items[0] : items
          if (first) {
            const korName = first.sbstnNmKor || ''
            const isYudok = first.sbstnTypeUnqno ? first.sbstnTypeUnqno.split('^')[0] : ''
            const hazard = first.hrmflnList ? first.hrmflnList.map(h => h.hrmflnClsfArtclNm).join(', ') : ''
            const pictograms = first.pctgrmCd || ''
            setReagent(prev => ({ ...prev, hazard: prev.hazard || hazard, ghs_pictograms: prev.ghs_pictograms || pictograms, ghs_live: { korName, isYudok, hazard, pictograms } }))
            if (!data.hazard && hazard) {
              await supabase.from('reagents').update({ hazard, hazard_source: 'auto_ghs', ghs_pictograms: pictograms }).eq('id', id)
              setReagent(prev => ({ ...prev, hazard, hazard_source: 'auto_ghs', ghs_pictograms: pictograms }))
            }
          }
        }
      } catch { /* GHS 조회 실패 시 무시 — DB 값만 표시 */ }
    }
  }

  async function fetchPendingChanges() {
    const { data } = await supabase.from('reagent_change_requests')
      .select('*').eq('reagent_id', id).eq('status', 'pending')
    setPendingChanges(data || [])
  }

  // 위치이동/폐기/필드수정/재고변경 이력을 날짜|대상|변경내용 형식으로 통일해서 한 타임라인으로 합침
  async function fetchHistory() {
    const [{ data: moves }, { data: disposals }, { data: fieldChanges }, { data: reagentLots }] = await Promise.all([
      supabase.from('location_history').select('*').eq('reagent_id', id).order('created_at', { ascending: false }).limit(30),
      supabase.from('disposal_requests').select('*').eq('reagent_id', id).in('status', ['disposed', 'rejected']).order('created_at', { ascending: false }).limit(30),
      supabase.from('reagent_change_requests').select('*').eq('reagent_id', id).eq('status', 'approved').order('created_at', { ascending: false }).limit(30),
      supabase.from('reagent_lots').select('id, lot_no').eq('reagent_id', id),
    ])
    const lotIds = (reagentLots || []).map(l => l.id)
    const lotNoById = new Map((reagentLots || []).map(l => [l.id, l.lot_no]))
    const { data: logs } = lotIds.length > 0
      ? await supabase.from('stock_logs').select('*').in('lot_id', lotIds).order('created_at', { ascending: false }).limit(30)
      : { data: [] }

    const lotLabel = (lotId, fallback) => lotId && lotNoById.has(lotId) ? `Lot ${lotNoById.get(lotId) || '(번호없음)'}` : (fallback || reagent?.name || '')

    const rows = [
      ...(moves || []).map(m => ({
        date: m.created_at, target: lotLabel(m.lot_id, m.reagent_name),
        desc: `위치 ${m.from_location_name || '미지정'} → ${m.to_location_name}`, actor: m.moved_by,
      })),
      ...(disposals || []).map(d => ({
        date: d.created_at, target: lotLabel(d.lot_id, d.lot_no ? `Lot ${d.lot_no}` : d.reagent_name),
        desc: d.status === 'disposed' ? `폐기 완료 (${d.reason || '-'})` : `폐기 반려 (${d.reason || '-'})`, actor: d.requested_by,
      })),
      ...(fieldChanges || []).map(f => ({
        date: f.created_at, target: reagent?.name || '',
        desc: `${FIELD_LABELS[f.field_name] || f.field_name}: ${f.old_value || '-'} → ${f.new_value}`, actor: f.requested_by,
      })),
      ...(logs || []).map(l => {
        const wasEmpty = l.before_sealed === 0 && l.before_stock === 0
        const isEmpty = l.after_sealed === 0 && l.after_stock === 0
        const isNew = wasEmpty && !isEmpty
        const usedUp = !wasEmpty && isEmpty
        const fromInventory = l.user_name?.startsWith('[실사]')
        return {
          date: l.created_at, target: lotLabel(l.lot_id),
          desc: isNew ? (fromInventory ? `재고실사 때 새로 등록된 기존 미등록 시약 (${l.after_sealed}병/${l.after_stock}%)` : `신규 등록 (${l.after_sealed}병/${l.after_stock}%)`)
            : usedUp ? '재고 소진 처리'
            : `재고 수정: ${l.before_sealed}병/${l.before_stock}% → ${l.after_sealed}병/${l.after_stock}%`,
          actor: l.user_name,
        }
      }),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
    setHistory(rows)
  }

  async function saveField(field, value, sourceField) {
    if (isAdmin) {
      const updateData = { [field]: value }
      if (sourceField) updateData[sourceField] = 'manual'
      await supabase.from('reagents').update(updateData).eq('id', id)
      setReagent(prev => ({ ...prev, [field]: value, ...(sourceField ? { [sourceField]: 'manual' } : {}) }))
    } else {
      if (!student) { alert('제출하려면 로그인이 필요해요. 로그인 후 다시 시도해주세요.'); return }
      await supabase.from('reagent_change_requests').insert({
        reagent_id: id, field_name: field,
        old_value: String(reagent[field] ?? ''), new_value: String(value),
        requested_by: student.name, requested_by_student_id: student.student_id,
        status: 'pending',
      })
      alert('수정 신청 완료! 관리자 승인 후 반영됩니다.')
      fetchPendingChanges()
    }
    setEditingField(null)
  }

  async function archiveReagent() {
    if (!isAdmin) return
    const stillActive = lots.filter(l => l.status === 'active')
    if (stillActive.length > 0) {
      alert('활성 재고(Lot)가 남아있어 삭제할 수 없습니다. 모든 Lot을 폐기/사용완료 처리한 뒤 다시 시도해주세요.')
      return
    }
    if (!window.confirm(`"${reagent.name}"을(를) 시약 마스터 목록에서 삭제할까요?\n(데이터는 삭제되지 않고 보관 처리되어 이력은 유지되지만, 목록에는 더 이상 표시되지 않습니다.)`)) return
    await supabase.from('reagents').update({ status: 'archived' }).eq('id', id)
    await supabase.from('admin_logs').insert({
      admin_name: student?.name || '관리자', action: '시약 종류 삭제',
      target_type: 'reagent',
      description: `시약 종류 삭제(보관 처리): ${reagent.name}`,
    })
    navigate('/reagents/list')
  }

  async function confirmReagent() {
    if (!student) { alert('로그인 후 이용해주세요'); return }
    const now = new Date().toISOString()
    await supabase.from('reagents').update({ last_confirmed_at: now, confirmed_by: student.student_id }).eq('id', id)
    setReagent(prev => ({ ...prev, last_confirmed_at: now, confirmed_by: student.student_id }))
    setConfirmedByName(student.name)
  }

  async function uploadMsds(file) {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { alert('20MB 이하 파일만 업로드할 수 있어요'); return }
    setUploadingMsds(true)
    const ext = file.name.split('.').pop()
    const path = `msds/${id}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) { alert('업로드 중 오류가 발생했습니다: ' + error.message); setUploadingMsds(false); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    await supabase.from('reagents').update({ msds_url: urlData.publicUrl, msds_source: 'manual' }).eq('id', id)
    setReagent(prev => ({ ...prev, msds_url: urlData.publicUrl, msds_source: 'manual' }))
    setUploadingMsds(false)
  }

  function startInlineEdit(lotId, field, currentValue, e) {
    e.stopPropagation()
    if (!isAdmin) return
    setInlineEdit({ lotId, field, value: currentValue })
  }

  async function saveInlineEdit(lot) {
    if (!inlineEdit) return
    const { lotId, field, value } = inlineEdit
    const numVal = Number(value)
    if (isNaN(numVal)) { alert('숫자를 입력해주세요'); return }
    await supabase.from('reagent_lots').update({ [field]: numVal }).eq('id', lotId)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: lotId, user_name: student?.name || '',
      before_sealed: lot.sealed_count,
      after_sealed: field === 'sealed_count' ? numVal : lot.sealed_count,
      before_stock: lot.current_stock,
      after_stock: field === 'current_stock' ? numVal : lot.current_stock,
    })
    setInlineEdit(null)
    fetchAll()
  }

  async function submitDisposal() {
    if (!disposalForm.lot_id) { alert('폐기할 Lot을 선택해주세요'); return }
    if (!disposalForm.reason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    if (!student) { alert('제출하려면 로그인이 필요해요. 로그인 후 다시 시도해주세요.'); return }
    const targetLot = lots.find(l => l.id === disposalForm.lot_id)
    await supabase.from('disposal_requests').insert({
      reagent_id: id, lot_id: targetLot?.id || null,
      reagent_name: reagent.name, lot_no: targetLot?.lot_no || null,
      quantity: disposalForm.quantity, reason: disposalForm.reason,
      requested_by: student.name, requested_by_student_id: student.student_id,
      status: 'pending',
    })
    alert('폐기 신청이 완료됐어요!')
    setShowDisposalModal(false)
    setDisposalForm({ lot_id: '', quantity: '1', reason: '' })
    fetchAll()
  }

  async function resolveDisposal(action) {
    if (!disposalPending) return
    if (action === 'confirm') {
      await supabase.from('disposal_requests').update({
        status: 'disposed', disposed_at: new Date().toISOString(), approved_by_student_id: student?.student_id ?? null,
      }).eq('id', disposalPending.id)
      const targetLotId = disposalPending.lot_id || lots[0]?.id
      if (targetLotId) await supabase.from('reagent_lots').update({
        sealed_count: 0, current_stock: 0, status: 'disposed', disposal_date: new Date().toISOString().split('T')[0], needs_review: false,
      }).eq('id', targetLotId)
    } else {
      await supabase.from('disposal_requests').update({ status: 'rejected' }).eq('id', disposalPending.id)
    }
    fetchAll()
  }

  async function submitMove() {
    if (!moveForm.lot_id) { alert('이동할 Lot을 선택해주세요'); return }
    if (!moveForm.to_location_id) { alert('이동할 위치를 선택해주세요'); return }
    if (!student) { alert('제출하려면 로그인이 필요해요. 로그인 후 다시 시도해주세요.'); return }
    const targetLot = lots.find(l => l.id === moveForm.lot_id)
    if (targetLot?.location_id === moveForm.to_location_id) { alert('현재 위치와 같습니다'); return }
    const fromLoc = locations.find(l => l.id === targetLot?.location_id)
    const toLoc = locations.find(l => l.id === moveForm.to_location_id)
    const fromLocName = fromLoc ? `${fromLoc.room}${fromLoc.detail ? ' - ' + fromLoc.detail : ''}` : '미지정'
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    if (isAdmin) {
      await supabase.from('reagent_lots').update({ location_id: moveForm.to_location_id }).eq('id', moveForm.lot_id)
      await supabase.from('location_history').insert({
        reagent_id: id, lot_id: moveForm.lot_id, reagent_name: reagent.name,
        from_location_id: targetLot?.location_id || null, from_location_name: fromLocName,
        to_location_id: moveForm.to_location_id, to_location_name: toLocName,
        moved_by: student.name, notes: moveForm.notes,
      })
      alert(`✅ 위치 이동 완료!\n${fromLocName} → ${toLocName}`)
      setShowMoveModal(false)
      fetchAll()
    } else {
      await supabase.from('location_requests').insert({
        reagent_id: id, lot_id: moveForm.lot_id, reagent_name: reagent.name,
        from_location_id: targetLot?.location_id || null, from_location_name: fromLocName,
        to_location_id: moveForm.to_location_id, to_location_name: toLocName,
        requested_by: student.name, requested_by_student_id: student.student_id, notes: moveForm.notes, status: 'pending',
      })
      alert('위치 이동 신청 완료! 관리자 승인 후 처리됩니다.')
      setShowMoveModal(false)
    }
  }

  // 이미 등록된 시약(마스터)에 새로 구매한 Lot을 추가 — 재구매 시 신규 시약으로 다시 등록할 필요 없게 하는 핵심 경로
  async function submitAddLot() {
    if (!addLotForm.location_id) { alert('보관 위치를 선택해주세요'); return }
    if (!student) { alert('제출하려면 로그인이 필요해요. 로그인 후 다시 시도해주세요.'); return }
    const { data: newLot } = await supabase.from('reagent_lots').insert({
      reagent_id: id, lot_no: addLotForm.lot_no || null, cat_no: addLotForm.cat_no || null,
      sealed_count: Number(addLotForm.sealed_count) || 0, current_stock: Number(addLotForm.current_stock) || 0,
      location_id: addLotForm.location_id, received_date: addLotForm.received_date || null,
      expiry_date: addLotForm.expiry_date || null, status: 'active',
    }).select().single()
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: newLot?.id || null, user_name: student.name,
      before_sealed: 0, after_sealed: Number(addLotForm.sealed_count) || 0,
      before_stock: 0, after_stock: Number(addLotForm.current_stock) || 0,
    })
    alert('새 Lot이 등록됐어요!')
    setShowAddLotModal(false)
    setAddLotForm({ lot_no: '', cat_no: '', sealed_count: '1', current_stock: '100', location_id: '', received_date: new Date().toISOString().split('T')[0], expiry_date: '' })
    fetchAll()
  }

  async function setLotStatus(lot, status) {
    if (!isAdmin) return
    const label = { used_up: '사용완료', missing: '분실' }[status] || status
    if (!window.confirm(`Lot ${lot.lot_no || '(번호없음)'}을(를) "${label}"(으)로 표시할까요?`)) return
    await supabase.from('reagent_lots').update({ status, sealed_count: 0, current_stock: 0, needs_review: false }).eq('id', lot.id)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: lot.id, user_name: student?.name || '',
      before_sealed: lot.sealed_count, after_sealed: 0, before_stock: lot.current_stock, after_stock: 0,
    })
    fetchAll()
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
  if (!reagent) return <div style={{ padding: '60px', textAlign: 'center', color: C.muted }}>시약을 찾을 수 없습니다.</div>

  const ghsList = getGhsPictograms(reagent.ghs_pictograms || reagent.ghs_live?.pictograms)
  const cardStyle = { background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 1px 3px rgba(16,24,40,.06)', overflow: 'hidden' }
  const cardHeadStyle = { padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontSize: '13.5px', fontWeight: '700', color: C.navy }

  const fieldRows = [
    ['cas_no', 'CAS 번호', reagent.cas_no, reagent.cas_source],
    ['company', '제조사', reagent.company, reagent.company_source],
    ['category', '성상', reagent.category, reagent.category_source],
    ['volume', '용량', reagent.volume ? `${reagent.volume} ${reagent.unit || ''}` : '', reagent.volume_source],
    ['hazard', '유해정보', reagent.hazard, reagent.hazard_source],
  ]
  const activeLots = lots.filter(l => l.status === 'active')
  const LOT_STATUS_LABEL = { active: '보유중', used_up: '사용완료', disposed: '폐기', missing: '분실' }
  const LOT_STATUS_COLOR = { active: '#00875A', used_up: C.muted, disposed: C.danger, missing: '#B7791F' }

  function openDisposalModal() {
    setDisposalForm({ lot_id: activeLots.length === 1 ? activeLots[0].id : '', quantity: '1', reason: '' })
    setShowDisposalModal(true)
  }
  function openMoveModal() {
    setMoveForm({ lot_id: activeLots.length === 1 ? activeLots[0].id : '', to_location_id: '', notes: '' })
    setShowMoveModal(true)
  }

  return (
    <div>
      <PageBanner
        title={reagent.name}
        sub={reagent.volume ? `${reagent.volume}${reagent.unit || ''}` : undefined}
        breadcrumb={['시약', reagent.name]}
        extra={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setShowAddLotModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px dashed #C9DAF5', background: '#F9FBFF', fontSize: '13px', color: '#1F4E96', fontWeight: '600', cursor: 'pointer' }}>📦 재고 등록</button>
            <button onClick={openMoveModal} disabled={activeLots.length === 0} style={{ padding: '9px 16px', borderRadius: '8px', border: `1px solid ${C.border}`, background: activeLots.length === 0 ? '#F7F7F7' : C.white, fontSize: '13px', color: '#586173', cursor: activeLots.length === 0 ? 'default' : 'pointer' }}>📍 위치 이동{!isAdmin && ' 신청'}</button>
            {activeInventorySession && (
              <button onClick={() => { if (!student) { alert('로그인 후 이용해주세요'); return } confirmReagent() }} style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: C.blue, fontSize: '13px', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>✓ 정보 맞음 · 확인만 하기</button>
            )}
            <div ref={moreMenuRef} style={{ position: 'relative' }}>
              <button onClick={() => setMoreMenuOpen(v => !v)} style={{
                padding: '9px 14px', borderRadius: '8px', border: `1px solid ${C.border}`,
                background: moreMenuOpen ? C.bg : C.white, fontSize: '13px', color: '#586173', cursor: 'pointer', fontWeight: '600',
              }}>⋯ 더보기</button>
              {moreMenuOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: '6px', minWidth: '170px',
                  display: 'flex', flexDirection: 'column', gap: '2px',
                }}>
                  <button onClick={() => { setEditMode(v => !v); setMoreMenuOpen(false) }} style={{
                    padding: '8px 12px', borderRadius: '6px', border: 'none', background: 'none',
                    fontSize: '13px', color: '#586173', cursor: 'pointer', textAlign: 'left', fontWeight: '600',
                  }} onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    ✏️ {editMode ? '수정 완료' : isAdmin ? '정보 수정' : '수정 신청'}
                  </button>
                  <button onClick={() => { openDisposalModal(); setMoreMenuOpen(false) }} disabled={activeLots.length === 0} style={{
                    padding: '8px 12px', borderRadius: '6px', border: 'none', background: 'none',
                    fontSize: '13px', color: activeLots.length === 0 ? C.muted : '#C13B3F', cursor: activeLots.length === 0 ? 'default' : 'pointer', textAlign: 'left', fontWeight: '600',
                  }} onMouseEnter={e => { if (activeLots.length > 0) e.currentTarget.style.background = '#FDECEC' }} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    🗑️ 폐기 신청
                  </button>
                  {isAdmin && (
                    <button onClick={() => { setMoreMenuOpen(false); archiveReagent() }} title="활성 재고가 없을 때만 삭제할 수 있어요" style={{
                      padding: '8px 12px', borderRadius: '6px', border: 'none', background: 'none',
                      fontSize: '13px', color: '#C13B3F', cursor: 'pointer', textAlign: 'left', fontWeight: '600',
                    }} onMouseEnter={e => e.currentTarget.style.background = '#FDECEC'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      🗑 시약 종류 삭제
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        }
      />
      <div style={{ padding: '20px 32px' }}>

      {editMode && !isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#FBF0DF', border: '1px solid #F0DBAE', borderRadius: '10px', padding: '11px 16px', marginBottom: '18px', fontSize: '12.5px', color: '#8A5A16' }}>
          ⚠️ 노란 배경으로 표시된 항목은 <b>수정 제안이 대기중</b>이에요. 관리자가 최종반영해야 실제로 바뀝니다. 값을 입력하고 포커스를 옮기면 신청이 접수돼요.
          {!student && <span> <b>제출하려면 로그인이 필요해요.</b></span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* 재고정보 — 학생이 상세페이지를 열었을 때 가장 먼저 궁금한 건 "어디 있는지,
              몇 병 남았는지"라 기본정보(CAS·제조사 등)보다 위로 올림. */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>재고정보 {lots.length > 1 && <span style={{ fontWeight: 400, color: C.muted, fontSize: '12px' }}>· Lot {lots.length}개</span>}</div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {lots.map(lot => {
                const editingSealed = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'sealed_count'
                const editingStock = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'current_stock'
                const isLow = lot.status === 'active' && lot.sealed_count === 0 && lot.current_stock <= 20
                const lotLoc = locations.find(l => l.id === lot.location_id)
                const canEdit = isAdmin && lot.status === 'active'
                return (
                  <div key={lot.id} style={{
                    paddingBottom: lots.length > 1 ? '12px' : 0, borderBottom: lots.length > 1 ? `1px solid ${C.borderRow}` : 'none',
                    opacity: lot.status === 'active' ? 1 : 0.6,
                    background: lot.pending_confirm ? '#F0F7FF' : 'transparent',
                    padding: lot.pending_confirm ? '8px' : 0, borderRadius: lot.pending_confirm ? '8px' : 0,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: '700', color: C.navy }}>Lot {lot.lot_no || '(번호 없음)'}</span>
                      <span style={{ fontSize: '10.5px', fontWeight: '700', color: LOT_STATUS_COLOR[lot.status] || C.muted }}>
                        {LOT_STATUS_LABEL[lot.status] || lot.status}
                      </span>
                      {lot.pending_confirm && (
                        <span title="실사 반영됨 · 최종 확정 대기 중" style={{ fontSize: '10px', fontWeight: '700', color: '#1565C0', background: '#E3F2FD', padding: '1px 6px', borderRadius: '8px' }}>검토대기</span>
                      )}
                      {isAdmin && lot.status === 'active' && (
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                          <button onClick={() => setLotStatus(lot, 'used_up')} style={{ fontSize: '10.5px', color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: '5px', padding: '2px 7px', cursor: 'pointer' }}>사용완료로 표시</button>
                          <button onClick={() => setLotStatus(lot, 'missing')} style={{ fontSize: '10.5px', color: '#B7791F', background: 'none', border: '1px solid #F0DBAE', borderRadius: '5px', padding: '2px 7px', cursor: 'pointer' }}>분실로 표시</button>
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>미개봉 병 수</div>
                        {editingSealed ? (
                          <input autoFocus type="number" min="0" value={inlineEdit.value}
                            onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                            onBlur={() => saveInlineEdit(lot)}
                            style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13.5px' }} />
                        ) : (
                          <div onClick={e => canEdit && startInlineEdit(lot.id, 'sealed_count', lot.sealed_count, e)}
                            style={{ fontSize: '13.5px', color: C.text, cursor: canEdit ? 'text' : 'default' }}>{lot.sealed_count}병</div>
                        )}
                      </div>
                      <div style={{ background: isLow ? '#FDECEC' : 'transparent', borderRadius: '8px', padding: isLow ? '8px 10px' : 0, margin: isLow ? '-8px -10px' : 0 }}>
                        <div style={{ fontSize: '11px', color: isLow ? '#C13B3F' : C.muted, marginBottom: '4px', fontWeight: isLow ? '600' : '400' }}>개봉 병 잔량{isLow ? ' · 부족' : ''}</div>
                        {editingStock ? (
                          <input autoFocus type="number" min="0" max="100" value={inlineEdit.value}
                            onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                            onBlur={() => saveInlineEdit(lot)}
                            style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13.5px' }} />
                        ) : (
                          <div onClick={e => canEdit && startInlineEdit(lot.id, 'current_stock', lot.current_stock, e)}
                            style={{ fontSize: '13.5px', color: C.text, cursor: canEdit ? 'text' : 'default' }}>{lot.current_stock}%</div>
                        )}
                      </div>
                      <InfoRow label="위치" value={lotLoc ? `${lotLoc.room}${lotLoc.detail ? ' · ' + lotLoc.detail : ''}` : ''} />
                      <InfoRow label="Cat No." value={lot.cat_no} />
                      <InfoRow label="입고일" value={lot.received_date} />
                      <InfoRow label="개봉일" value={lot.opened_date} />
                      <InfoRow label="유효기간" value={lot.expiry_date} />
                      {lot.disposal_date && <InfoRow label="폐기일" value={lot.disposal_date} />}
                    </div>
                  </div>
                )
              })}
              {lots.length === 0 && <div style={{ color: C.muted, fontSize: '13px' }}>등록된 Lot이 없습니다. "📦 재고 등록"으로 추가하세요.</div>}
            </div>
          </div>

          {/* 기본정보 */}
          <div style={cardStyle}>
            <div style={{ ...cardHeadStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
              기본정보
              {reagent?.pending_confirm && (
                <span title="실사 반영됨 · 최종 확정 대기 중" style={{ fontSize: '10px', fontWeight: '700', color: '#1565C0', background: '#E3F2FD', padding: '1px 6px', borderRadius: '8px' }}>검토대기</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', padding: '18px 20px' }}>
              {fieldRows.map(([field, label, value, source]) => {
                const pending = pendingChanges.find(p => p.field_name === field)
                const isEditing = editMode && editingField === field
                return (
                  <div key={field} style={{ background: pending ? '#FBF0DF' : 'transparent', borderRadius: '8px', padding: pending ? '8px 10px' : 0, margin: pending ? '-8px -10px' : 0 }}>
                    {pending && (
                      <div style={{ fontSize: '10.5px', color: '#8A5A16', marginBottom: '3px', fontWeight: '600' }}>
                        {isAdmin ? `${pending.requested_by} 제안 · 대기중` : '수정 제안됨 · 대기중'}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>{label}</div>
                    {isEditing && field === 'company' ? (
                      <CompanyPicker value={editingValue} onChange={setEditingValue}
                        onPick={v => saveField(field, v, source ? `${field}_source` : null)}
                        onKeyDown={e => { if (e.key === 'Enter') saveField(field, editingValue, source ? `${field}_source` : null) }}
                        onBlur={() => saveField(field, editingValue, source ? `${field}_source` : null)}
                        style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px' }} />
                    ) : isEditing ? (
                      <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveField(field, editingValue, source ? `${field}_source` : null) }}
                        onBlur={() => saveField(field, editingValue, source ? `${field}_source` : null)}
                        style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px' }} />
                    ) : (
                      <div style={{ fontSize: '13.5px', color: C.text, cursor: editMode ? 'text' : 'default' }}
                        onClick={() => { if (editMode) { setEditingField(field); setEditingValue(value || '') } }}>
                        {value || '-'}
                        {source === 'auto_ghs' && (
                          <span title="국가유해물질정보 자동조회로 채워졌어요" style={{ marginLeft: '6px', fontSize: '9.5px', color: C.muted, background: '#F3F4F6', padding: '1px 6px', borderRadius: '8px' }}>🔎 MSDS 자동조회</span>
                        )}
                        {pending && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#8A5A16' }}>→ {pending.new_value}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 안전정보 */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>안전정보</div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ghsList.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ghsList.map(g => (
                    <span key={g.code} title={g.code} style={{ background: '#FDECEC', color: '#C13B3F', fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '999px' }}>{g.emoji} {g.label}</span>
                  ))}
                </div>
              )}
              {reagent.ghs_live?.isYudok && (
                <span style={{ background: '#FDECEC', color: '#C13B3F', border: '1px solid #F3D6D6', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', width: 'fit-content' }}>⚠️ {reagent.ghs_live.isYudok}</span>
              )}
              {ghsList.length === 0 && !reagent.ghs_live?.isYudok && <div style={{ fontSize: '12.5px', color: C.muted }}>등록된 위험정보가 없습니다.</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {reagent.msds_url ? (
                  <a href={reagent.msds_url} target="_blank" rel="noreferrer" style={{ fontSize: '12.5px' }}>📄 MSDS 문서 보기</a>
                ) : (
                  <span style={{ fontSize: '12.5px', color: C.muted }}>등록된 MSDS 파일이 없습니다.</span>
                )}
                {reagent.cas_no && (
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(reagent.cas_no + ' MSDS')}`} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: C.muted }}>
                    🔍 CAS 번호로 MSDS 검색
                  </a>
                )}
                <a href="https://msds.kosha.or.kr/MSDSInfo/kcic/msdssearch.do" target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: C.muted }}>
                  🔍 안전보건공단(KOSHA) MSDS 검색{reagent.cas_no ? ` — CAS ${reagent.cas_no} 검색` : ''}
                </a>
                {isAdmin && (
                  <label style={{ fontSize: '11.5px', color: C.blue, cursor: uploadingMsds ? 'default' : 'pointer' }}>
                    {uploadingMsds ? '업로드 중...' : (reagent.msds_url ? '📤 제조사 SDS(MSDS) 파일 교체' : '📤 제조사 SDS(MSDS) 파일 업로드')}
                    <input type="file" accept="application/pdf" disabled={uploadingMsds}
                      onChange={e => uploadMsds(e.target.files[0])} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 관리정보 */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>관리정보</div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: C.muted }}>최종확인일</span>
                <span style={{ fontSize: '13px', color: C.text, fontWeight: '600' }}>
                  {reagent.last_confirmed_at
                    ? isAdmin
                      ? `${new Date(reagent.last_confirmed_at).toLocaleDateString()} · ${confirmedByName || reagent.confirmed_by}`
                      : new Date(reagent.last_confirmed_at).toLocaleDateString()
                    : '확인 기록 없음'}
                </span>
              </div>
              {isAdmin && reagent.registered_by && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: C.muted }}>등록자</span>
                  <span style={{ fontSize: '13px', color: C.text, fontWeight: '600' }}>
                    {new Date(reagent.created_at).toLocaleDateString()} · {registeredByName || reagent.registered_by}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: C.muted }}>비고</span>
                <span style={{ fontSize: '13px', color: C.text }}>{reagent.notes || '-'}</span>
              </div>
            </div>
          </div>

          {/* 대기중 변경 */}
          {pendingChanges.length > 0 && (
            <div style={{ ...cardStyle, border: '1px solid #F0DBAE' }}>
              <div style={{ ...cardHeadStyle, borderBottom: '1px solid #F0DBAE', background: '#FBF0DF', color: '#8A5A16' }}>대기중인 수정 제안 · {pendingChanges.length}건</div>
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pendingChanges.map(p => (
                  <div key={p.id}>
                    <div style={{ fontSize: '12.5px', color: C.text }}>{FIELD_LABELS[p.field_name] || p.field_name}: <b>{p.old_value || '-'} → {p.new_value}</b></div>
                    {isAdmin && <div style={{ fontSize: '11px', color: C.muted }}>제안: {p.requested_by} · {new Date(p.created_at).toLocaleDateString()}</div>}
                  </div>
                ))}
                {isAdmin && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>관리자 메뉴 &gt; 변경 요청에서 승인/반려할 수 있어요.</div>}
              </div>
            </div>
          )}

          {/* 폐기 신청 대기중 */}
          {disposalPending && (
            <div style={{ ...cardStyle, border: '1px solid #F3D6D6' }}>
              <div style={{ ...cardHeadStyle, borderBottom: '1px solid #F3D6D6', background: '#FDECEC', color: '#C13B3F' }}>🗑️ 폐기 신청 대기중</div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '12.5px', color: C.text, marginBottom: '4px' }}>사유: {disposalPending.reason}</div>
                {isAdmin && <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px' }}>신청: {disposalPending.requested_by} · {new Date(disposalPending.created_at).toLocaleDateString()}</div>}
                {isAdmin ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => resolveDisposal('reject')} style={{ flex: 1, padding: '8px 0', borderRadius: '7px', border: `1px solid ${C.border}`, background: C.white, fontSize: '12px', color: '#586173', cursor: 'pointer' }}>보류</button>
                    <button onClick={() => resolveDisposal('confirm')} style={{ flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', background: '#E5484D', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>폐기 확정</button>
                  </div>
                ) : (
                  <div style={{ fontSize: '10.5px', color: C.muted }}>관리자만 처리 가능합니다.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 변경이력 */}
      {history.length > 0 && (
        <div style={{ marginTop: '20px', ...cardStyle }}>
          <div style={cardHeadStyle}>변경이력</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['날짜', '대상', '변경내용', ...(isAdmin ? ['처리자'] : [])].map(h => (
              <th key={h} style={{ padding: '9px 20px', textAlign: 'left', fontSize: '11px', color: C.muted, fontWeight: '600', borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td style={{ padding: '9px 20px', fontSize: '11px', color: C.muted, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.borderRow}` }}>{new Date(h.date).toLocaleDateString()}</td>
                  <td style={{ padding: '9px 20px', fontSize: '12px', fontWeight: '600', color: C.navy, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.borderRow}` }}>{h.target}</td>
                  <td style={{ padding: '9px 20px', fontSize: '12px', color: C.text, borderBottom: `1px solid ${C.borderRow}` }}>{h.desc}</td>
                  {isAdmin && <td style={{ padding: '9px 20px', fontSize: '12px', color: C.muted, borderBottom: `1px solid ${C.borderRow}` }}>{h.actor || '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 폐기 신청 모달 */}
      {showDisposalModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowDisposalModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>🗑️ 폐기 신청</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{reagent.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {activeLots.length > 1 && (
                <div><label style={labelStyle}>폐기할 Lot *</label>
                  <select value={disposalForm.lot_id} onChange={e => setDisposalForm({ ...disposalForm, lot_id: e.target.value })} style={inputStyle}>
                    <option value="">선택하세요</option>
                    {activeLots.map(l => {
                      const loc = locations.find(x => x.id === l.location_id)
                      return <option key={l.id} value={l.id}>Lot {l.lot_no || '번호없음'} · {loc ? `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}` : '위치미정'} · {l.sealed_count}병/{l.current_stock}%</option>
                    })}
                  </select></div>
              )}
              <div><label style={labelStyle}>수량</label>
                <input value={disposalForm.quantity} onChange={e => setDisposalForm({ ...disposalForm, quantity: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>폐기 사유 *</label>
                <textarea value={disposalForm.reason} rows={3} onChange={e => setDisposalForm({ ...disposalForm, reason: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} /></div>
            </div>
            <div style={{ fontSize: '11.5px', color: student ? C.muted : '#C13B3F', marginTop: '10px' }}>
              {student ? `신청자: ${student.name}` : '※ 제출하려면 로그인이 필요해요'}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button onClick={() => setShowDisposalModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitDisposal} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.danger, color: '#fff', cursor: 'pointer', fontWeight: '700' }}>신청하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 위치 이동 모달 */}
      {showMoveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMoveModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📍 위치 이동{!isAdmin && ' 신청'}</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{reagent.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {activeLots.length > 1 && (
                <div><label style={labelStyle}>이동할 Lot *</label>
                  <select value={moveForm.lot_id} onChange={e => setMoveForm({ ...moveForm, lot_id: e.target.value })} style={inputStyle}>
                    <option value="">선택하세요</option>
                    {activeLots.map(l => {
                      const loc = locations.find(x => x.id === l.location_id)
                      return <option key={l.id} value={l.id}>Lot {l.lot_no || '번호없음'} · {loc ? `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}` : '위치미정'}</option>
                    })}
                  </select></div>
              )}
              <div><label style={labelStyle}>이동할 위치 *</label>
                <select value={moveForm.to_location_id} onChange={e => setMoveForm({ ...moveForm, to_location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select></div>
              <div><label style={labelStyle}>메모</label>
                <input value={moveForm.notes} onChange={e => setMoveForm({ ...moveForm, notes: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ fontSize: '11.5px', color: student ? C.muted : '#C13B3F', marginTop: '10px' }}>
              {student ? `${isAdmin ? '이동자' : '신청자'}: ${student.name}` : '※ 제출하려면 로그인이 필요해요'}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button onClick={() => setShowMoveModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitMove} style={{ ...btnPrimary, flex: 1 }}>{isAdmin ? '이동' : '신청하기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 재고 등록(새 Lot 추가) 모달 */}
      {showAddLotModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddLotModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📦 재고 등록</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{reagent.name} — 새로 구매한 Lot을 추가해요. 시약명·CAS 등은 다시 입력할 필요 없어요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><label style={labelStyle}>Lot No.</label>
                  <input value={addLotForm.lot_no} onChange={e => setAddLotForm({ ...addLotForm, lot_no: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Cat No.</label>
                  <input value={addLotForm.cat_no} onChange={e => setAddLotForm({ ...addLotForm, cat_no: e.target.value })} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><label style={labelStyle}>미개봉 병 수</label>
                  <input type="number" min="0" value={addLotForm.sealed_count} onChange={e => setAddLotForm({ ...addLotForm, sealed_count: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>개봉 병 잔량(%)</label>
                  <input type="number" min="0" max="100" value={addLotForm.current_stock} onChange={e => setAddLotForm({ ...addLotForm, current_stock: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>보관 위치 *</label>
                <select value={addLotForm.location_id} onChange={e => setAddLotForm({ ...addLotForm, location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><label style={labelStyle}>입고일</label>
                  <input type="date" value={addLotForm.received_date} onChange={e => setAddLotForm({ ...addLotForm, received_date: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>유효기간</label>
                  <input type="date" value={addLotForm.expiry_date} onChange={e => setAddLotForm({ ...addLotForm, expiry_date: e.target.value })} style={inputStyle} /></div>
              </div>
            </div>
            <div style={{ fontSize: '11.5px', color: student ? C.muted : '#C13B3F', marginTop: '10px' }}>
              {student ? `등록자: ${student.name}` : '※ 제출하려면 로그인이 필요해요'}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button onClick={() => setShowAddLotModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitAddLot} style={{ ...btnPrimary, flex: 1 }}>등록하기</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
