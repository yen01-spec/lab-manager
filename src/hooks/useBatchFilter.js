import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadReagentIndex, parseBatchLines, runBatchMatch } from '../lib/reagentSearch'
import { clearBatch, loadBatch, saveBatch } from '../lib/batchFilterStore'

// 시약목록의 "일괄검색 필터" — 여러 줄 입력을 공통 검색 규칙(lib/reagentSearch)으로 메모리의 시약 인덱스에 대조해
// 시약 id 집합을 만들고, 목록의 다른 필터와 AND 로 적용한다. 입력 줄마다 DB 를 조회하지 않는다.
//  · URL: bs=1 표시만(flag/setFlag = useReagentListParams). 실제 입력·결과는 sessionStorage(lib/batchFilterStore).
//  · flag 가 켜져 있어도 저장된 상태가 없으면(새 세션에서 URL 만 열린 경우) 조용히 flag 를 지운다.
export function useBatchFilter({ flag, setFlag }) {
  const [stored, setStored] = useState(() => loadBatch())
  const batch = flag ? stored : null

  useEffect(() => { if (flag && !stored) setFlag(false) }, [flag, stored, setFlag])

  // 반환: { ok:true, batch } | { ok:false, reason:'empty'|'load' }
  const apply = useCallback(async (text) => {
    if (parseBatchLines(text).terms.length === 0) return { ok: false, reason: 'empty' }
    let index
    try { index = await loadReagentIndex() } catch { return { ok: false, reason: 'load' } }
    const r = runBatchMatch(index, text)
    const next = { v: 1, text, terms: r.terms, matchedIds: r.matchedIds, unmatched: r.unmatched, duplicates: r.duplicates, truncated: r.truncated, at: Date.now() }
    saveBatch(next); setStored(next); setFlag(true)
    return { ok: true, batch: next }
  }, [setFlag])

  const clear = useCallback(() => { clearBatch(); setStored(null); setFlag(false) }, [setFlag])

  const idSet = useMemo(() => (batch ? new Set(batch.matchedIds) : null), [batch])
  return { batch, idSet, apply, clear }
}
