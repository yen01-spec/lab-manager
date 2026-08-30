import { C, btnPrimary, btnGhost, inputStyle, labelStyle } from '../../design'
import DateSplitInput from '../DateSplitInput'

// 🚀 실사 시작 모달 — 연도/라벨/시작일/관리자 이름/모드(전수조사·현재목록)/범위(전체·구역선택)를 입력.
export default function StartSessionModal({
  startForm, setStartForm, zoneMode, setZoneMode, rooms, locations, zoneTokenOf, onStart, onClose,
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '380px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
        <h3 style={{ marginTop: 0, color: C.navy }}>🚀 실사 시작</h3>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>연도</label>
          <input type="number" value={startForm.year} onChange={e => setStartForm({ ...startForm, year: Number(e.target.value) })} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>라벨 (선택)</label>
          <input value={startForm.label || ''} onChange={e => setStartForm({ ...startForm, label: e.target.value })} placeholder="예: 1학기, 여름방학, 3층 점검" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>시작일 *</label>
          <DateSplitInput value={startForm.start_date} onChange={v => setStartForm({ ...startForm, start_date: v })} />
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>관리자 이름 *</label>
          <input value={startForm.created_by} onChange={e => setStartForm({ ...startForm, created_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>실사 모드 *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              ['full_census', '📋 전수조사', '검색·대조 패널로만 입력하고, 아래엔 완료/미완료 목록만 보여줘요'],
              ['current_list', '📊 현재목록 재고실사', '지금처럼 상단 검색과 하단 전체 편집 표를 같이 써요'],
            ].map(([key, label, desc]) => (
              <button key={key} onClick={() => setStartForm({ ...startForm, mode: key })} style={{
                textAlign: 'left', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                border: `1.5px solid ${startForm.mode === key ? C.navy : C.border}`,
                background: startForm.mode === key ? C.bg : C.white,
              }}>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: startForm.mode === key ? C.navy : C.text }}>{label}</div>
                <div style={{ fontSize: '11.5px', color: C.muted, marginTop: '2px' }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>실사 범위</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button onClick={() => { setZoneMode('all'); setStartForm({ ...startForm, zones: [] }) }} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${zoneMode === 'all' ? C.navy : C.border}`, background: zoneMode === 'all' ? C.navy : C.white, color: zoneMode === 'all' ? '#fff' : C.text }}>전체</button>
            <button onClick={() => setZoneMode('select')} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${zoneMode === 'select' ? C.navy : C.border}`, background: zoneMode === 'select' ? C.navy : C.white, color: zoneMode === 'select' ? '#fff' : C.text }}>구역 선택</button>
          </div>
          {zoneMode === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: C.bg, borderRadius: '8px', maxHeight: '260px', overflowY: 'auto' }}>
              {rooms.map(r => {
                const locsInRoom = locations.filter(l => l.room === r)
                // 세부 위치(시약장)가 하나뿐이거나 없으면 방 이름 자체를 하나의 구역으로 취급.
                // 저장/매칭에 쓰는 값(token)은 다른 방과 이름이 겹치면 "방 · 세부위치"로 구분하되,
                // 버튼에는 이미 방 이름이 위에 제목으로 있으니 세부위치명만 짧게 보여줌.
                const zoneEntries = locsInRoom.length > 0
                  ? [...new Map(locsInRoom.map(l => [zoneTokenOf(l), l.detail || l.room])).entries()]
                  : [[r, r]]
                return (
                  <div key={r}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '4px' }}>{r}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {zoneEntries.map(([z, label]) => (
                        <button key={z} onClick={() => {
                          const cur = startForm.zones || []
                          setStartForm({ ...startForm, zones: cur.includes(z) ? cur.filter(x => x !== z) : [...cur, z] })
                        }} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', border: `1px solid ${(startForm.zones || []).includes(z) ? C.navy : C.border}`, background: (startForm.zones || []).includes(z) ? C.navy : C.white, color: (startForm.zones || []).includes(z) ? '#fff' : C.text, fontWeight: (startForm.zones || []).includes(z) ? '700' : '400' }}>{label}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#92400E' }}>
          ⚠️ 실사 시작 시 전체 Lot의 현재 재고가 장부 수량으로 저장됩니다.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>취소</button>
          <button onClick={onStart} style={{ ...btnPrimary, flex: 1 }}>시작</button>
        </div>
      </div>
    </div>
  )
}
