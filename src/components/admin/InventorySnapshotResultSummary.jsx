import { C, btnPrimary, btnExcel } from '../../design'

// 동기화 적용 완료 화면(Phase 4b-3a §34) — RPC 반환 JSON({updated_lots, new_lots,
// not_in_snapshot_lots, reactivated_lots, new_reagents, archived_reagents,
// reactivated_reagents})을 그대로 받아 보여준다. 4b-3a에서는 실제 적용 버튼이 항상
// disabled라 이 컴포넌트가 실제로 화면에 뜰 일은 없다 — 4b-3b에서 그 guard를 풀면 바로
// 쓸 수 있도록 미리 구현해둔다(순수 presentational, fixture로만 검증됨).
export default function InventorySnapshotResultSummary({ result, onGoReagentList, onDownloadResultExcel }) {
  if (!result) return null
  const rows = [
    ['기존 Lot 갱신', result.updated_lots],
    ['재활성화된 Lot(현재 목록 제외 → 다시 보유)', result.reactivated_lots],
    ['신규 Lot', result.new_lots],
    ['현재 목록 제외', result.not_in_snapshot_lots],
    ['신규 시약', result.new_reagents],
    ['보관 처리된 시약(모든 Lot 제외)', result.archived_reagents],
    ['재활성화된 시약', result.reactivated_reagents],
  ]
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px', background: '#F0FFF4' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#1E7A46', marginBottom: 12 }}>✅ 현재 재고 동기화 완료</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {rows.map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: C.text }}>{label}</span>
            <b style={{ color: C.navy }}>{(val ?? 0).toLocaleString()}</b>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onDownloadResultExcel && <button onClick={onDownloadResultExcel} style={btnExcel}>📊 결과 Excel 다운로드</button>}
        {onGoReagentList && <button onClick={onGoReagentList} style={btnPrimary}>시약목록으로 이동</button>}
      </div>
    </div>
  )
}
