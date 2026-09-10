import { useState } from 'react'
import { C, inputStyle, btnPrimary, btnExcel } from '../../design'
import ReagentAutocomplete from '../ReagentAutocomplete'

// 상단 검색창 + 일괄검색/신규등록/엑셀 버튼 줄.
// 검색 입력값(draft)은 이 컴포넌트가 들고 있고, Enter나 "검색" 버튼을 눌렀을 때만
// onSubmitSearch로 상위에 올려보낸다 — 타이핑 한 글자마다 무거운 목록 페이지가
// 리렌더되지 않도록 입력 상태와 실제 검색 상태를 분리한 것.
export default function ReagentToolbar({
  initialSearch = '', onSubmitSearch, onSearchSelect,
  onOpenBulkLookup, onOpenRegister,
  isAdmin, hasResults, onExportExcel,
}) {
  // 홈 화면 등에서 ?q=로 들어온 초기 검색어만 반영 — 이후 타이핑은 이 draft만 갱신하고
  // 상위(무거운 목록 페이지)는 건드리지 않는다. Enter/검색 버튼에서만 onSubmitSearch로 확정.
  const [draft, setDraft] = useState(initialSearch)

  const submit = () => onSubmitSearch(draft.trim())

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
      padding: '12px 16px', boxShadow: '0 1px 3px rgba(16,24,40,.06)',
      display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px' }}>
        <ReagentAutocomplete
          value={draft}
          onChange={setDraft}
          onSelect={onSearchSelect}
          onEnter={submit}
          placeholder="시약명(국문·영문) 또는 CAS No.로 검색..."
          inputStyle={{ ...inputStyle, width: '100%' }} />
        <button onClick={submit} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>검색</button>
      </div>
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
    </div>
  )
}
