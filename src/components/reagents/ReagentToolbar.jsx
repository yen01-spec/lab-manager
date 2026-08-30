import { C, inputStyle, btnPrimary } from '../../design'
import ReagentAutocomplete from '../ReagentAutocomplete'

// 상단 검색창 + 일괄검색/신규등록/엑셀/편집 버튼 줄.
export default function ReagentToolbar({
  search, setSearch, onSearchSelect, onSearchEnter,
  onOpenBulkLookup, onOpenRegister,
  isAdmin, hasResults, editMode, onToggleEditMode, onExportExcel,
}) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
      padding: '12px 16px', boxShadow: '0 1px 3px rgba(16,24,40,.06)',
      display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px' }}>
        <ReagentAutocomplete
          value={search}
          onChange={setSearch}
          onSelect={onSearchSelect}
          onEnter={onSearchEnter}
          placeholder="시약 이름 또는 CAS No.로 검색..."
          inputStyle={{ ...inputStyle, width: '100%' }} />
        <button onClick={onSearchEnter} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>검색</button>
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
        <button onClick={onExportExcel} style={{
          background: '#1D6F42', color: 'white', border: 'none',
          padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
          fontSize: '13px', fontWeight: '600', flexShrink: 0,
        }}>📥 엑셀</button>
      )}
      {isAdmin && hasResults && (
        <button onClick={onToggleEditMode} style={{
          background: editMode ? C.navy : C.white,
          color: editMode ? C.white : C.text,
          border: `1px solid ${editMode ? C.navy : C.border}`,
          padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
          fontSize: '13px', fontWeight: '600', flexShrink: 0,
        }}>✏️ {editMode ? '편집 종료' : '편집'}</button>
      )}
    </div>
  )
}
