import { useEffect, useState, useCallback } from 'react'
import { C } from '../../design'
import { getResources } from '../../lib/resources'
import ResourceFileCard from './ResourceFileCard'

// 자료 탭 "공식 자료 및 양식" — resource_files SELECT 전용 표시 (Phase 5-h2a).
// 현재 자료(is_current) 3분류 + 같은 resource_key 의 이전 버전은 접어서, 남은 이전 자료는 하단에.
const TYPE_ORDER = [
  { key: 'form', label: '필수 양식' },
  { key: 'official', label: '공식 지침·매뉴얼' },
  { key: 'reference', label: '참고자료' },
]

export default function ResourceFiles({ categoryKey, sectionKey }) {
  const [state, setState] = useState({ status: 'loading', rows: [] })

  const load = useCallback(() => {
    if (!categoryKey || !sectionKey) return
    let alive = true
    setState({ status: 'loading', rows: [] })
    getResources(categoryKey, sectionKey)
      .then(rows => { if (alive) setState({ status: 'ok', rows }) })
      .catch(() => { if (alive) setState({ status: 'error', rows: [] }) })
    return () => { alive = false }
  }, [categoryKey, sectionKey])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => load(), [load])

  const title = <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em', marginBottom: 8 }}>공식 자료 및 양식</div>

  if (state.status === 'loading') {
    return <div>{title}<div style={{ fontSize: 12, color: C.muted, padding: '8px 12px', background: C.bg, borderRadius: 8 }}>불러오는 중...</div></div>
  }
  if (state.status === 'error') {
    return (
      <div>{title}
        <div style={{ fontSize: 12.5, color: C.danger, padding: '10px 12px', background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8 }}>
          자료를 불러오지 못했습니다. <button onClick={load} style={{ marginLeft: 6, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit' }}>다시 시도</button>
        </div>
      </div>
    )
  }

  const { rows } = state
  if (rows.length === 0) {
    return <div>{title}<div style={{ fontSize: 12, color: C.muted, padding: '8px 12px', background: C.bg, borderRadius: 8 }}>현재 등록된 공식 자료가 없습니다.</div></div>
  }

  const current = rows.filter(r => r.is_current)
  const old = rows.filter(r => !r.is_current)
  const usedOldIds = new Set()
  const olderOf = (r) => {
    if (!r.resource_key) return []
    const fam = old.filter(o => o.resource_key === r.resource_key)
    fam.forEach(o => usedOldIds.add(o.id))
    return fam
  }
  const orphanOld = () => old.filter(o => !usedOldIds.has(o.id))

  return (
    <div>
      {title}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {TYPE_ORDER.map(t => {
          const group = current.filter(r => r.resource_type === t.key)
          if (group.length === 0) return null
          return (
            <div key={t.key}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.map(r => {
                  const olders = olderOf(r)
                  return (
                    <div key={r.id}>
                      <ResourceFileCard row={r} />
                      {olders.length > 0 && (
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ fontSize: 11.5, color: C.muted, cursor: 'pointer', padding: '2px 0 2px 4px' }}>이전 버전 {olders.length}건</summary>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, paddingLeft: 12 }}>
                            {olders.map(o => <ResourceFileCard key={o.id} row={o} dim />)}
                          </div>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {orphanOld().length > 0 && (
          <details>
            <summary style={{ fontSize: 12, color: C.muted, cursor: 'pointer', fontWeight: 600 }}>이전 자료 {orphanOld().length}건</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {orphanOld().map(o => <ResourceFileCard key={o.id} row={o} dim />)}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
