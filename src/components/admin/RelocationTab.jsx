import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, btnExcel, btnGhost, inputStyle, labelStyle, thStyle, tdStyle } from '../../design'
import { fetchAllPages } from '../../lib/fetchAllPages'
import {
  buildRelocationRows, classifyBottles, groupByLocation, locationName, ROLE_SPARE,
} from '../../lib/relocationPlan'

// ══════════════════════════════════════════════
//  시약장 재배치 작업표 — 현재 위치별 병 목록 + 바뀔 위치(계획) → Excel(현장 인쇄용)
//  · 조회(SELECT)만 한다. 내보내기/계획 수정은 DB 의 실제 위치를 바꾸지 않는다.
//  · 바뀔 위치(계획)는 이 브라우저의 초안(localStorage)으로만 보관한다.
// ══════════════════════════════════════════════
const DRAFT_KEY = 'lm_relocation_plan_v1'
const loadDraft = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    return d && typeof d === 'object' ? d : {}
  } catch { return {} }
}

export default function RelocationTab() {
  const draft = useMemo(() => loadDraft(), [])
  const [locations, setLocations] = useState([])
  const [lots, setLots] = useState([])
  const [state, setState] = useState({ status: 'loading', message: '' })
  const [selected, setSelected] = useState(() => new Set(Array.isArray(draft.selected) ? draft.selected : []))
  const [spareTarget, setSpareTarget] = useState(draft.spareTarget || '')
  const [inUseTarget, setInUseTarget] = useState(draft.inUseTarget || '')
  const [overrides, setOverrides] = useState(draft.overrides && typeof draft.overrides === 'object' ? draft.overrides : {})
  const [previewLoc, setPreviewLoc] = useState('')
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [locs, all] = await Promise.all([
          supabase.from('locations').select('*').order('room').then(r => { if (r.error) throw r.error; return r.data || [] }),
          fetchAllPages((from, to) => supabase.from('reagent_lots')
            .select('id, reagent_id, lot_no, sealed_count, current_stock, location_id, received_date, status, reagents(id, name, cas_no, company, volume, unit, sort_letter)')
            .eq('status', 'active').order('id').range(from, to)),
        ])
        if (!alive) return
        setLocations(locs); setLots(all); setState({ status: 'ok', message: '' })
      } catch (e) {
        if (alive) setState({ status: 'error', message: e?.message || '불러오지 못했습니다.' })
      }
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ selected: [...selected], spareTarget, inUseTarget, overrides })) } catch { /* 초안 저장 실패는 무시 */ }
  }, [selected, spareTarget, inUseTarget, overrides])

  const roles = useMemo(() => classifyBottles(lots), [lots])
  const counts = useMemo(() => {
    const m = new Map()
    for (const l of lots) {
      const c = m.get(l.location_id) || { total: 0, spare: 0 }
      c.total++
      if (roles.get(l.id)?.role === ROLE_SPARE) c.spare++
      m.set(l.location_id, c)
    }
    return m
  }, [lots, roles])

  const validIds = useMemo(() => new Set(locations.map(l => l.id)), [locations])
  const selectedIds = useMemo(() => [...selected].filter(id => validIds.has(id)), [selected, validIds])
  const plan = useMemo(() => ({ spareTarget: spareTarget || null, inUseTarget: inUseTarget || null, overrides }), [spareTarget, inUseTarget, overrides])
  const rows = useMemo(() => buildRelocationRows({ lots, locations, selectedLocationIds: selectedIds, plan }), [lots, locations, selectedIds, plan])
  const groups = useMemo(() => groupByLocation(rows, locations, selectedIds), [rows, locations, selectedIds])
  const shown = groups.find(g => g.locationId === previewLoc) || groups[0]
  const totalBottles = rows.length

  const usableLocations = useMemo(() => locations.filter(l => (counts.get(l.id)?.total || 0) > 0), [locations, counts])
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  function setRowTarget(row, value) {
    setOverrides(prev => {
      const next = { ...prev }
      const auto = row.role === ROLE_SPARE ? spareTarget : inUseTarget
      if ((value || '') === (auto || '')) delete next[row.lotId]
      else next[row.lotId] = value
      return next
    })
  }

  async function exportXlsx() {
    if (groups.length === 0 || exporting) return
    setExporting(true); setNotice(null)
    try {
      const { downloadRelocationXlsx } = await import('../../lib/relocationExcel')
      const nameOf = id => (id ? locationName(locations.find(l => l.id === id)) : '')
      await downloadRelocationXlsx(groups, {
        spareTargetName: nameOf(spareTarget), inUseTargetName: nameOf(inUseTarget),
        overrideCount: Object.keys(overrides).filter(id => rows.some(r => r.lotId === id)).length,
        generatedAt: new Date().toLocaleString('ko-KR'),
      })
      setNotice({ kind: 'ok', text: `Excel 을 만들었습니다. (${groups.length}개 위치 · ${totalBottles}병) DB 의 실제 위치는 바뀌지 않았습니다.` })
    } catch (e) {
      setNotice({ kind: 'err', text: `Excel 생성 중 오류: ${e?.message || e}` })
    }
    setExporting(false)
  }

  if (state.status === 'loading') return <Card title="🗄️ 시약장 재배치 작업표"><div style={{ padding: 30, textAlign: 'center', color: C.muted }}>재고를 불러오는 중…</div></Card>
  if (state.status === 'error') return <Card title="🗄️ 시약장 재배치 작업표"><div role="alert" style={{ padding: 20, color: '#C13B3F' }}>불러오지 못했습니다: {state.message}</div></Card>

  const targetSelect = (value, onChange, label) => (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle} aria-label={label}>
        <option value="">변경 없음(현재 위치 유지)</option>
        {locations.map(l => <option key={l.id} value={l.id}>{locationName(l)}</option>)}
      </select>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="🗄️ 시약장 재배치 작업표" sub="현재 위치 → 바뀔 위치 · 현장 인쇄용 Excel">
        <div style={{ background: '#FBF0DF', color: '#8A5A16', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.55, marginBottom: 14 }}>
          이 화면은 <b>계획만</b> 만들고 Excel 로 내보냅니다. 내보내기·계획 수정은 <b>DB 의 실제 위치를 바꾸지 않습니다</b>. 병을 실제로 옮긴 뒤 관리자가 확인해 별도로 반영합니다.
          병 1개 = 1행이며, 사용중/여분은 같은 시약의 활성 병 중 <b>잔량이 가장 적은 병 = 사용중</b>(미개봉은 100%로 계산), 나머지 = 여분으로 계산합니다.
        </div>

        <div style={{ ...labelStyle, marginBottom: 6 }}>1. 현재 위치 선택 (병이 있는 위치만 표시)</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...btnGhost, padding: '4px 12px', fontSize: 12 }} onClick={() => setSelected(new Set(usableLocations.map(l => l.id)))}>전체 선택</button>
          <button type="button" style={{ ...btnGhost, padding: '4px 12px', fontSize: 12 }} onClick={() => setSelected(new Set())}>선택 해제</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6, marginBottom: 16 }}>
          {usableLocations.map(l => {
            const c = counts.get(l.id)
            return (
              <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', background: selected.has(l.id) ? '#EEF2FB' : '#fff', minWidth: 0 }}>
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{locationName(l)}</span>
                <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{c.total}병 · 여분 {c.spare}</span>
              </label>
            )
          })}
        </div>

        <div style={{ ...labelStyle, marginBottom: 6 }}>2. 바뀔 위치 계획 (기본 규칙 — 개별 병은 아래 미리보기에서 수정)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
          {targetSelect(spareTarget, setSpareTarget, '여분 병의 바뀔 위치')}
          {targetSelect(inUseTarget, setInUseTarget, '사용중 병의 바뀔 위치')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={exportXlsx} disabled={groups.length === 0 || exporting}
            style={{ ...btnExcel, opacity: groups.length === 0 || exporting ? 0.5 : 1, cursor: groups.length === 0 || exporting ? 'not-allowed' : 'pointer' }}>
            {exporting ? 'Excel 만드는 중…' : '📥 작업표 Excel 내보내기'}
          </button>
          <span style={{ fontSize: 12.5, color: C.muted }}>{groups.length === 0 ? '현재 위치를 선택하세요' : `${groups.length}개 위치 · ${totalBottles}병 (시트: 요약 + 위치별)`}</span>
        </div>
        {notice && <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: notice.kind === 'ok' ? '#276749' : '#C13B3F' }}>{notice.text}</div>}
      </Card>

      {groups.length > 0 && shown && (
        <Card title="3. 미리보기" sub="현재 위치별 · 알파벳 순">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {groups.map(g => (
              <button key={g.locationId} type="button" onClick={() => setPreviewLoc(g.locationId)}
                style={{ padding: '5px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, background: g.locationId === shown.locationId ? C.navy : C.bg, color: g.locationId === shown.locationId ? '#fff' : C.text }}>
                {g.locationName} ({g.summary.total})
              </button>
            ))}
          </div>
          <div data-testid="reloc-summary" style={{ background: C.bg, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, marginBottom: 10, lineHeight: 1.6 }}>
            <div><b>총 {shown.summary.total}병</b> (시약 {shown.summary.kinds}종) · 사용중 {shown.summary.inUse} / 여분 {shown.summary.spare} · 이동 예정 {shown.summary.moves}{shown.summary.ties ? ` · 동률 확인 ${shown.summary.ties}` : ''}</div>
            <div>알파벳별: {shown.summary.letterLine || '-'}</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead><tr>{['알파벳', '시약명', '회사', 'Lot No.', '병 ID', '개봉/잔량', '병 역할', '현재 위치', '바뀔 위치(계획)'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.rows.map(r => (
                  <tr key={r.lotId} data-testid="reloc-row">
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{r.letter}</td>
                    <td style={{ ...tdStyle, overflowWrap: 'anywhere', maxWidth: 260 }}>{r.reagentName}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{r.company || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{r.lotNo || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: 11.5, color: C.muted, fontFamily: 'monospace' }}>{r.shortId}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{r.opened ? `개봉 ${r.remain}%` : '미개봉'}</td>
                    <td style={{ ...tdStyle, fontSize: 12, fontWeight: r.role === ROLE_SPARE ? 400 : 700 }}>{r.role === ROLE_SPARE ? '○ 여분' : '● 사용중'}{r.tie ? ' (동률)' : ''}</td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>{r.currentLocation}</td>
                    <td style={tdStyle}>
                      <select aria-label={`바뀔 위치 ${r.reagentName} ${r.shortId}`} value={r.plannedLocationId || ''} onChange={e => setRowTarget(r, e.target.value)} style={{ ...inputStyle, padding: '4px 6px', fontSize: 12, minWidth: 170 }}>
                        <option value="">변경 없음</option>
                        {locations.filter(l => l.id !== r.currentLocationId).map(l => <option key={l.id} value={l.id}>{locationName(l)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
