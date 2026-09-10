import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { C, btnPrimary, btnExcel } from '../../design'
import PillNav from '../PillNav'
import ResourceReagentCard from './ResourceReagentCard'

// 자료 탭의 여러 업무(특별관리물질·폐시약·사전유해인자)에서 공용으로 쓰는 대상 시약 목록.
// 성능(§60/§61): 첫 로드는 가벼운 컬럼만 받아 필터를 적용하고, 매칭된 시약만 상세+Lot 조회.
//
// props:
//  - filterFn(lightReagent) => true | false | 'check'         (단일 필터)
//  - filterPresets: [{ key, label, fn }]                       (상단 알약 필터바)
//  - 둘 다 없으면: 검색어 입력 후에만 결과 표시(검색 전용)
//  - requireActiveLots: 활성 Lot이 있는 시약만 표시(폐시약 등)
//  - lightColumns: 라이트 select에 추가할 컬럼 (필터에서 hazard 등이 필요할 때)
//  - maxDetail: 상세 조회 상한(기본 400) — 대량 렌더 방지
//  - fields / lotFields / dedupeByCas / selectable / onExport / title / emptyText

const LIGHT_BASE = 'id, name, name_ko, cas_no'

export default function ResourceReagentList({
  filterFn, filterPresets, requireActiveLots = false, lightColumns = '',
  fields, lotFields, selectable = false, onExport, exportLabel = '목록 내보내기',
  emptyText = '조건에 맞는 시약이 없습니다.', dedupeByCas = false, title, maxDetail = 400,
}) {
  const navigate = useNavigate()
  const [light, setLight] = useState(null)
  const [detail, setDetail] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [committed, setCommitted] = useState('')
  const [presetKey, setPresetKey] = useState(filterPresets?.[0]?.key || null)
  const [checkedIds, setCheckedIds] = useState(new Set())

  const searchMode = !filterFn && !filterPresets
  const activePreset = filterPresets?.find(p => p.key === presetKey)
  const effectiveFilter = filterFn || activePreset?.fn || null

  useEffect(() => {
    let alive = true
    const cols = lightColumns ? `${LIGHT_BASE}, ${lightColumns}` : LIGHT_BASE
    supabase.from('reagents').select(cols).neq('status', 'archived').range(0, 9999)
      .then(({ data }) => { if (alive) { setLight(data || []); setLoading(false) } })
    return () => { alive = false }
  }, [lightColumns])

  // 필터 적용된 대상(라이트)
  const targets = useMemo(() => {
    if (!light) return []
    if (effectiveFilter) return light.map(r => ({ r, hit: effectiveFilter(r) })).filter(x => x.hit)
    const q = committed.trim().toLowerCase()
    if (!q) return null
    return light
      .filter(r => (r.name || '').toLowerCase().includes(q) || (r.name_ko || '').includes(committed.trim()) || (r.cas_no || '').includes(q))
      .map(r => ({ r, hit: true }))
  }, [light, effectiveFilter, committed])

  const cappedTargets = useMemo(() => (targets || []).slice(0, maxDetail), [targets, maxDetail])
  const targetIds = useMemo(() => cappedTargets.map(t => t.r.id), [cappedTargets])
  const overCap = (targets?.length || 0) > maxDetail

  // 대상에 대해서만 상세 + Lot 조회
  useEffect(() => {
    const missing = targetIds.filter(id => !detail[id])
    if (missing.length === 0) return
    let alive = true
    ;(async () => {
      for (let i = 0; i < missing.length; i += 200) {
        const chunk = missing.slice(i, i + 200)
        const { data } = await supabase.from('reagents')
          .select('id, name, name_ko, cas_no, company, purity, volume, unit, hazard, hazard_classifications, ghs_pictograms, msds_url, reagent_lots(id, lot_no, lot_source, cat_no, current_stock, sealed_count, received_date, expiry_date, disposal_date, status, location_id)')
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

  let rows = cappedTargets.map(t => ({ ...(detail[t.r.id] || { ...t.r, _lots: [], _pending: true }), _hit: t.hit }))
  if (requireActiveLots) rows = rows.filter(r => r._pending || (r._lots || []).length > 0)
  if (dedupeByCas && rows.length) {
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
  const checkCount = effectiveFilter ? rows.filter(r => r._hit === 'check').length : 0
  const selectedReagents = rows.filter(r => checkedIds.has(r.id))

  function toggleCheck(r) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })
  }

  return (
    <div>
      {title && (
        <div style={{ marginBottom: 12, fontSize: 13, color: C.text }}>
          {title} <b style={{ color: C.navy, fontSize: 16 }}>{rows.length}종</b>
        </div>
      )}

      {filterPresets && (
        <PillNav items={filterPresets.map(p => ({ key: p.key, label: p.label }))}
          value={presetKey} onChange={setPresetKey} style={{ marginBottom: 14 }} />
      )}

      {searchMode && (
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
            <span><b style={{ color: C.text }}>{rows.length}종</b></span>
            {checkCount > 0 && <span style={{ color: '#8A5A16' }}>· ❓ 확인 필요 {checkCount}종 포함</span>}
            {overCap && <span style={{ color: C.danger }}>· 상위 {maxDetail}종만 표시 (범위를 좁혀주세요)</span>}
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
