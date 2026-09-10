import { C } from '../design'

// 알약형 세부 선택 버튼 그룹. 시약목록의 위치 세부선택과 같은 디자인.
// items: [{ key, label }], value: 현재 key, onChange(key)
export default function PillNav({ items, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', ...style }}>
      {items.map(it => {
        const active = it.key === value
        return (
          <button key={it.key} onClick={() => onChange(it.key)} style={{
            padding: '5px 14px', borderRadius: '20px', fontSize: '12.5px', cursor: 'pointer',
            border: `1px solid ${active ? C.navy : C.border}`,
            background: active ? C.navy : C.white,
            color: active ? '#fff' : C.text,
            fontWeight: active ? '700' : '400', fontFamily: 'inherit',
          }}>{it.label}</button>
        )
      })}
    </div>
  )
}
