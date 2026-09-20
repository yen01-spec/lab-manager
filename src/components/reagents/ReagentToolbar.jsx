import { memo } from 'react'
import { C, btnExcel } from '../../design'
import ReagentSearchBar from './ReagentSearchBar'

// 상단 검색창 + 일괄검색/신규등록/엑셀 버튼 줄.
// 검색 입력값(draft)은 이 컴포넌트가 들고 있고, Enter나 "검색" 버튼을 눌렀을 때만
// onSubmitSearch로 상위에 올려보낸다 — 타이핑 한 글자마다 무거운 목록 페이지가
// 리렌더되지 않도록 입력 상태와 실제 검색 상태를 분리한 것.
// memo — 목록 페이지의 체크박스 선택/필터 변경 리렌더가 검색창까지 번지지 않게 한다
// (상위에서 넘기는 콜백은 useCallback으로 고정).
function ReagentToolbar({
  initialSearch = '', onSubmitSearch, onSearchSelect,
  onOpenBulkLookup, onOpenRegister,
  isAdmin, hasResults, onExportExcel,
}) {
  return (
    <ReagentSearchBar value={initialSearch} onSubmit={onSubmitSearch} onSelect={onSearchSelect}>
      <button onClick={onOpenBulkLookup} style={{
        background: C.white, color: C.text, border: `1px solid ${C.border}`,
        padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
        fontSize: '13px', fontWeight: '600', flexShrink: 0,
      }}>📋 시약 일괄 검색</button>
      <button onClick={onOpenRegister} style={{
        background: '#F9FBFF', color: '#1F4E96', border: `1px dashed #C9DAF5`,
        padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
        fontSize: '13px', fontWeight: '600', flexShrink: 0,
      }}>🆕 신규 시약 등록</button>
      {isAdmin && hasResults && (
        <button onClick={onExportExcel} style={{ ...btnExcel, flexShrink: 0 }}>📊 Excel로 내보내기</button>
      )}
    </ReagentSearchBar>
  )
}

export default memo(ReagentToolbar)
