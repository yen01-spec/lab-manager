import { useState } from 'react'
import { C, inputStyle, btnPrimary } from '../../design'
import ReagentSearchInput from '../ReagentSearchInput'

// "시약을 찾는 경험"의 정본 검색 줄 — 시약목록(ReagentToolbar)과 시약 일괄정리가 같은 카드/검색창/검색 버튼을 쓴다.
// 입력값(draft)은 이 컴포넌트가 들고 있고, Enter 나 "검색" 버튼에서만 onSubmit(term)으로 확정한다(타이핑마다 무거운 목록이 다시 그려지지 않게).
// 자동추천을 고르면 onSelect(item). value(확정된 검색어)가 밖에서 바뀌면(뒤로가기·추천 선택 등) 입력창도 따라간다.
// children = 화면별 추가 버튼(일괄검색/신규등록/Excel 등).
export default function ReagentSearchBar({ value = '', onSubmit, onSelect, placeholder, children }) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (synced !== value) { setSynced(value); setDraft(value) }   // 렌더 중 상태 보정 패턴

  const submit = () => onSubmit(draft.trim())

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
      padding: '12px 16px', boxShadow: '0 1px 3px rgba(16,24,40,.06)',
      display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px' }}>
        <ReagentSearchInput
          value={draft}
          onChange={setDraft}
          onSelect={onSelect}
          onEnter={submit}
          placeholder={placeholder}
          inputStyle={{ ...inputStyle, width: '100%' }} />
        <button onClick={submit} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>검색</button>
      </div>
      {children}
    </div>
  )
}
