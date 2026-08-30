import { useState } from 'react'
import CompanyPicker from '../CompanyPicker'
import { diffCellStyle } from '../../lib/inventoryUtils'

// 회사명 칸 전용 — CompanyPicker는 controlled 컴포넌트라 나머지 필드들이 쓰는
// defaultValue+onBlur 저장 패턴(fieldInputCell/panelMasterField)과 안 맞아서 따로 뺌.
// 로컬에 잠깐 값을 들고 있다가, 로고를 클릭하면 그 즉시 저장하고(다른 필드의 버튼형
// 선택과 동일하게), 직접 타이핑한 값은 기존과 동일하게 blur/Enter 때 저장.
export default function StagedCompanyField({ value, bookVal, touched, differs, disabled, onSave, onEnter, width, inputRef, baseStyle }) {
  const [local, setLocal] = useState(value)
  // 렌더 중에 이전 value와 비교해서 바뀌었으면 그 자리에서 로컬 상태를 다시 맞춤 —
  // useEffect로 하면 "effect 안에서 setState"로 리렌더가 한 번 더 도는 문제가 있어서
  // React 공식 권장 패턴(렌더 중 조정)으로 처리.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setLocal(value)
  }
  function commit(v) {
    onSave(v !== '' ? v : bookVal)
  }
  return (
    <CompanyPicker
      value={local}
      disabled={disabled}
      onChange={setLocal}
      onPick={commit}
      onBlur={() => commit(local)}
      onKeyDown={e => { if (e.key === 'Enter') { commit(local); if (onEnter) onEnter() } }}
      inputRef={inputRef}
      placeholder={bookVal}
      style={{ ...baseStyle, width: width ? `${width}px` : undefined, padding: '5px 8px', borderRadius: '6px', fontSize: '12px', ...diffCellStyle(touched, differs) }}
    />
  )
}
