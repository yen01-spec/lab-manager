import { useEffect, useRef, useState } from 'react'
import { C, thStyle, tdStyle, btnExcel } from '../../design'
import { exportPickedReagents } from '../../exportUtils'
import { exportSchoolRegistrationForPicked } from '../../lib/schoolRegistrationExport'

function Modal({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '640px', maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
        {children}
      </div>
    </div>
  )
}

// Excel 내보내기 드롭다운 (Phase P2 §8/§22) — 시약목록의 선택목록을 내보내기의 단일 중심으로.
// 형식을 바꾸거나 실패해도 pickedIds는 절대 건드리지 않는다(§24) — 이 컴포넌트는 읽기+삭제만
// 하고 초기화는 부모(ReagentList)의 "선택 해제" 버튼에서만 일어난다.
function ExportMenu({ picked, locations }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function runGeneral() {
    setError('')
    exportPickedReagents(picked, locations)
    setOpen(false)
  }

  async function runSchool() {
    setError('')
    setBusy(true)
    try {
      const res = await exportSchoolRegistrationForPicked(picked.map(r => r.id))
      if (!res.cancelled) setOpen(false)
    } catch (e) {
      // 실패해도 선택 상태·모달은 그대로 유지 — 사용자가 바로 다시 시도하거나 다른 형식을 고를 수 있게.
      setError(e.message || '학교 화학물질 등록 양식 생성 중 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} disabled={busy} style={{ ...btnExcel, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
        {busy ? '학교 양식을 생성하는 중...' : `📊 Excel 내보내기 ${open ? '▲' : '▼'}`}
      </button>
      {open && !busy && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 310,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', width: 280, overflow: 'hidden',
        }}>
          <button onClick={runGeneral} style={menuItem()}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>일반 시약목록</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>현재 선택한 시약 정보를 일반 Excel로 저장</div>
          </button>
          <button onClick={runSchool} style={{ ...menuItem(), borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>학교 화학물질 등록 양식</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>학교 화학물질 등록용 형식으로 생성</div>
          </button>
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, width: 280, zIndex: 310, fontSize: 11.5, color: C.dangerDark, background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  )
}

function menuItem() {
  return { display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }
}

// 검색결과에서 체크해 모아둔 "선택 목록"을 인쇄/PDF·MSDS 일괄 열기·Excel로 내보내는 모달.
export default function PickedListModal({ pickedIds, setPickedIds, locations, onClose }) {
  const picked = Array.from(pickedIds.values())
  return (
    <Modal onClose={onClose}>
      <div className="picked-print-target">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>선택 목록</div>
            <h2 style={{ margin: 0, color: C.navy, fontSize: '18px', fontWeight: '800' }}>선택한 시약 {pickedIds.size}개</h2>
          </div>
          <button className="no-print" onClick={onClose} style={{ background: 'transparent', border: 'none', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#CBD5E0' }}>×</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <thead>
            <tr>
              {['시약명', '규격/용량', '잔량', '위치', '최근 확인', ''].map(h => (
                <th key={h} style={thStyle} className={h === '' ? 'no-print' : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {picked.map(r => {
              const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
              const avgStock = activeLots.length > 0
                ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : null
              const locIds = new Set(activeLots.map(l => l.location_id).filter(Boolean))
              const loc = locIds.size === 1 ? locations.find(l => l.id === activeLots[0].location_id) : null
              const locText = locIds.size > 1 ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'
              return (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.name}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{r.volume ? `${r.volume}${r.unit || ''}` : '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px' }}>{avgStock !== null ? `${avgStock}%` : '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{locText}</td>
                  <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted }}>{r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}</td>
                  <td className="no-print" style={{ ...tdStyle, textAlign: 'center' }}>
                    <button onClick={() => setPickedIds(prev => { const next = new Map(prev); next.delete(r.id); return next })}
                      style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '13px' }}>제거</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="no-print" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>닫기</button>
        <button onClick={() => {
          document.body.classList.add('printing-picked-list')
          window.print()
          setTimeout(() => document.body.classList.remove('printing-picked-list'), 200)
        }} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🖨️ 인쇄/PDF</button>
        <button onClick={() => {
          const withMsds = picked.filter(r => r.msds_url)
          if (withMsds.length === 0) { alert('선택한 시약 중 등록된 MSDS 파일이 있는 항목이 없어요.'); return }
          withMsds.forEach(r => window.open(r.msds_url, '_blank'))
        }} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          📄 MSDS 일괄 열기 ({picked.filter(r => r.msds_url).length}건)
        </button>
        <ExportMenu picked={picked} locations={locations} />
      </div>
    </Modal>
  )
}
