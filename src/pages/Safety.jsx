const C = {
  navy: '#1a2a5e', gold: '#E8A020', white: '#FFFFFF',
  bg: '#F0F2F7', border: '#DDE2EE', text: '#1C2B4A', muted: '#6B7A99',
}

const SAFETY_MATERIALS = [
  { title: '가스 안전', icon: '💨' },
  { title: '기계 안전', icon: '⚙️' },
  { title: '소방안전', icon: '🔥' },
  { title: '신규 연구활동종사자를 위한 연구실 안전관리', icon: '🔬' },
  { title: '실험 전후 안전', icon: '🧪' },
  { title: '연구실 사고사례집', icon: '📋' },
  { title: '연구실사고 대응 표준매뉴얼', icon: '🚨' },
  { title: '연구실책임자를 위한 안전관리 실무', icon: '📘' },
  { title: '연구실책임자를 위한 안전관리 이론', icon: '📗' },
  { title: '연구실책임자를 위한 안전의식', icon: '🧠' },
  { title: '연구활동종사자를 위한 보건관리', icon: '🏥' },
  { title: '전기 안전', icon: '⚡' },
  { title: '화학 안전', icon: '☢️' },
]

export default function Safety() {
  return (
    <div style={{ padding: '32px 24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Safety Management</div>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.navy }}>연구실 안전관리</h1>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: C.muted }}>연구실 안전 표준교재 목록입니다. PDF 자료는 순차적으로 업로드될 예정입니다.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
        {SAFETY_MATERIALS.map(({ title, icon }) => (
          <div key={title} style={{
            background: C.white, borderRadius: '12px', padding: '16px 20px',
            border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ fontSize: '24px' }}>{icon}</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>{title}</div>
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>📎 준비중</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}