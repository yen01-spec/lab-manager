// ── 디자인 토큰 (전 페이지 공통) ────────────────────────
export const C = {
  navy:      '#1a2a5e',
  navyDark:  '#111d42',
  navyLight: '#2a3f7e',
  gold:      '#E8A020',
  goldLight: '#F5C050',
  steelBlue: '#4A6FA5',
  white:     '#FFFFFF',
  bg:        '#F0F2F7',
  border:    '#DDE2EE',
  text:      '#1C2B4A',
  muted:     '#6B7A99',
  danger:    '#D63031',
  dangerBg:  '#FFF5F5',
  success:   '#00875A',
  warning:   '#E8A020',
}

// ── 공통 스타일 ──────────────────────────────────────────
export const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: '6px',
  border: `1px solid ${C.border}`, boxSizing: 'border-box',
  fontSize: '14px', color: C.text, background: C.white,
  outline: 'none', transition: 'border-color 0.15s',
}

export const labelStyle = {
  display: 'block', marginBottom: '5px',
  fontSize: '12px', fontWeight: '600',
  color: C.muted, letterSpacing: '0.03em',
  textTransform: 'uppercase',
}

export const btnPrimary = {
  background: C.navy, color: C.white, border: 'none',
  padding: '9px 22px', borderRadius: '6px', cursor: 'pointer',
  fontSize: '13px', fontWeight: '600', letterSpacing: '0.02em',
  transition: 'background 0.15s',
}

export const btnGold = {
  background: C.gold, color: C.navy, border: 'none',
  padding: '9px 22px', borderRadius: '6px', cursor: 'pointer',
  fontSize: '13px', fontWeight: '700',
}

export const btnGhost = {
  background: C.white, color: C.text,
  border: `1px solid ${C.border}`,
  padding: '9px 22px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
}

export const thStyle = {
  padding: '11px 14px', textAlign: 'left',
  borderBottom: `2px solid ${C.border}`,
  fontSize: '11px', color: C.muted, fontWeight: '700',
  letterSpacing: '0.05em', textTransform: 'uppercase',
  background: C.bg,
}

export const tdStyle = {
  padding: '11px 14px', borderBottom: `1px solid ${C.border}`,
  fontSize: '13px', color: C.text,
}

// ── 페이지 배너 컴포넌트 ─────────────────────────────────
export function PageBanner({ title, sub, breadcrumb = [] }) {
  return (
    <div style={{
      background: '#fff',
      borderBottom: `1px solid ${C.border}`,
      padding: '12px',
      display: 'flex', alignItems: 'center', gap: '16px',
    }}>
      {breadcrumb.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', color: C.muted }}>
          <span>🏠</span>
          {breadcrumb.map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ opacity: 0.4 }}>›</span>
              <span style={{ color: i === breadcrumb.length - 1 ? C.text : C.muted }}>{b}</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ width: '1px', height: '20px', background: C.border }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <h1 style={{ margin: 0, color: C.navy, fontSize: '16px', fontWeight: '800', letterSpacing: '-0.01em' }}>{title}</h1>
        <span style={{ fontSize: '11px', color: C.gold, fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{sub}</span>
      </div>
    </div>
  )
}

// ── 카드 컴포넌트 ────────────────────────────────────────
export function Card({ title, sub, children, extra, noPadding }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`,
      borderRadius: '10px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
    }}>
      {title && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
          background: C.bg,
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy }}>{title}</div>
            {sub && <div style={{ fontSize: '11px', color: C.muted, marginTop: '1px' }}>{sub}</div>}
          </div>
          {extra}
        </div>
      )}
      <div style={noPadding ? {} : { padding: '20px' }}>{children}</div>
    </div>
  )
}

// ── 상태 뱃지 ────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    pending:   { label: '대기중',   bg: '#FFF3E0', color: '#E65100' },
    approved:  { label: '승인됨',   bg: '#E8F5E9', color: '#2E7D32' },
    rejected:  { label: '반려됨',   bg: '#FFEBEE', color: '#C62828' },
    ordered:   { label: '발주완료', bg: '#EDE7F6', color: '#4527A0' },
    delivered: { label: '배송완료', bg: '#E3F2FD', color: '#1565C0' },
    done:      { label: '완료',     bg: '#F5F5F5', color: '#616161' },
  }
  const s = map[status] || { label: status, bg: '#F5F5F5', color: '#616161' }
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '3px 10px', borderRadius: '12px',
      fontSize: '11px', fontWeight: '700', letterSpacing: '0.02em',
    }}>{s.label}</span>
  )
}
