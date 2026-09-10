import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { C, btnPrimary, btnExcel } from '../../design'
import ResourceReagentCard from './ResourceReagentCard'

// 자료 탭의 여러 업무(특별관리물질·폐시약·사전유해인자)에서 공용으로 쓰는 대상 시약 목록.
// 성능(§60/§61): 첫 로드는 가벼운 컬럼만(id,name,name_ko,cas_no)으로 받아 필터를 적용하고,
// 매칭된 시약에 대해서만 상세+Lot을 조회한다.
//
// props:
//  - filterFn(lightReagent) => true | false | 'check'  (없으면 검색어 입력 후에만 결과 표시)
//  - fields / lotFields : ResourceReagentCard로 전달
//  - selectable : 체크박스 다중선택
//  - onExport(selectedReagents | allReagents) : 있으면 "목록 내보내기" 버튼 표시
//  - emptyText

export default function ResourceReagentList({
  filterFn, fields, lotFields, selectable = false, onExport, exportLabel = '목록 내보내기',
  emptyText = '조건에 맞는 시약이 없습니다.', dedupeByCas = false, title,
}) {
  const navigate = useNavigate()
  const [light, setLight] = useState(null)      // [{id,name,name_ko,cas_no, _hit}]
  const [detail, setDetail] = useState({})      // id -> full reagent + _lots
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [committed, setCommitted] = useState('')
  const [checkedIds, setCheckedIds] = useState(new Set())

  useEffect(() => {
    let alive = true
    supabase.from('reagents').select('id, name, name_ko, cas_no').neq('status', 'archived').range(0, 9999)
      .then(({ data }) => { if (alive) { setLight(data || []); setLoading(false) } })
    return () => { alive = false }
  }, [])

  // 필터 적용된 대상
  const targets = useMemo(() => {
    if (!light) return []
    if (filterFn) return light.map(r => ({ r, hit: filterFn(r) })).filter(x => x.hit)
    // 필터 없으면 검색 전용 모드
    const q = committed.trim().toLowerCase()
    if (!q) return null
    return light
      .filter(r => (r.name || '').toLowerCase().includes(q) || (r.name_ko || '').includes(committed.trim()) || (r.cas_no || '').includes(q))
      .map(r => ({ r, hit: true }))
  }, [light, filterFn, committed])

  const targetIds = useMemo(() => (targets || []).map(t => t.r.id), [targets])

  // 대상에 대해서만 상세 + Lot 조회
  useEffect(() => {
    const missing = targetIds.filter(id => !detail[id])
    if (missing.length === 0) return
    let alive = true
    ;(async () => {
      for (let i = 0; i < missing.length; i += 200) {
        const chunk = missing.slice(i, i + 200)
        const { data } = await supabase.from('reagents')
          .select('id, name, name_ko, cas_no, company, purity, volume, unit, hazard, msds_url, reagent_lots(id, lot_no, lot_source, cat_no, current_stock, sealed_count, received_date, expiry_date, disposal_date, status, location_id)')
          .in('id', chunk)
        if (!alive || !data) return
        const locIds = [...new Set(data.flatMap(r => (r.reagent_lots || []).map(l => l.location_id)).filter(Boolean))]
        const { data: locs } = locIds.length ? await supabase.from('locations').select('id, room, detail').in('id', locIds) : { data: [] }
        const locMap = new Map((locs || []).map(l => [l.id, `${l.room}${l.detail ? ' - ' + l.detail : ''}`]))
        setDetail(prev => {
          const next = { ...prev }
          for (const r of data) {
            const lots = (r.reagent_lots || []).filter(l => l.status === 'active')
              .map(l => ({ ...l, _locText: locMap.get(l.location_id) || '미지정' }))
            next[r.id] = { ...r, _catNo: (r.reagent_lots || [])[0]?.cat_no || '', _lots: lots }
          }
          return next
        })
      }
    })()
    return () => { alive = false }
  }, [targetIds, detail])

  let rows = (targets || []).map(t => ({ ...(detail[t.r.id] || { ...t.r, _lots: [] }), _hit: t.hit }))
  if (dedupeByCas && rows.length) {
    // CAS 기준 동일 화학물질은 1종으로 — 여러 마스터의 Lot을 한 카드로 합침(§5-d)
    const byCas = new Map()
    for (const r of rows) {
      const key = r.cas_no ? r.cas_no.trim() : 'nocas:' + r.id
      if (!byCas.has(key)) byCas.set(key, { ...r, _lots: [...(r._lots || [])] })
      else {
        const g = byCas.get(key)
        g._lots = [...g._lots, ...(r._lots || [])]
        if (r._hit === true) g._hit = true
      }
    }
    rows = [...byCas.values()]
  }
  const checkFilter = filterFn ? rows.filter(r => r._hit === 'check').length : 0

  function toggleCheck(r) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })
  }
  const selectedReagents = rows.filter(r => checkedIds.has(r.id))

  return (
    <div>
      {title && (
        <div style={{ marginBottom: 12, fontSize: 13, color: C.text }}>
          {title} <b style={{ color: C.navy, fontSize: 16 }}>{rows.length}종</b>
        </div>
      )}
      {!filterFn && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setCommitted(search)}
            placeholder="시약명(국문·영문) 또는 CAS로 검색 후 Enter"
            style={{ flex: 1, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
          <button onClick={() => setCommitted(search)} style={{ ...btnPrimary, padding: '8px 16px' }}>검색</button>
        </div>
      )}

      {loading || !light ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>불러오는 중...</div>
      ) : targets === null ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>검색어를 입력하면 대상 시약을 찾습니다.</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>{emptyText}</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 12.5, color: C.muted, flexWrap: 'wrap' }}>
            <span><b style={{ color: C.text }}>{rows.length}종</b> 대상</span>
            {checkFilter > 0 && <span style={{ color: '#8A5A16' }}>· ❓ 확인 필요 {checkFilter}종 포함</span>}
            {selectable && checkedIds.size > 0 && <span style={{ color: C.navy }}>· {checkedIds.size}종 선택됨</span>}
            {onExport && (
              <button onClick={() => onExport(selectable && checkedIds.size > 0 ? selectedReagents : rows)}
                style={{ ...btnExcel, marginLeft: 'auto', padding: '7px 14px', fontSize: 12 }}>📊 {exportLabel}</button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(r => (
              <ResourceReagentCard key={r.id} reagent={r} fields={fields} lotFields={lotFields}
                checked={selectable ? checkedIds.has(r.id) : undefined}
                onToggleCheck={selectable ? toggleCheck : undefined}
                onOpenDetail={rr => navigate(`/reagents/${rr.id}`)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
