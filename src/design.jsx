// ═══════════════════════════════════════════════════════
//  design.jsx  —  디자인 시스템 (토큰 + 공통 컴포넌트)
//  핸드오프 기준: Navy #16233E + Blue #2F6BDB
// ═══════════════════════════════════════════════════════

import { Link } from 'react-router-dom'

// ── 컬러 토큰 ───────────────────────────────────────────
export const C = {
  // Brand
  navy:        '#16233E',   // 헤더, 강조 텍스트
  navyDeep:    '#1A2230',   // 페이지 제목, 최진한 텍스트
  blue:        '#2F6BDB',   // 주요 액션, 아이콘, 링크
  blueDark:    '#1F4E96',   // 활성 메뉴 텍스트
  blueTint:    '#EAF1FB',   // 활성 메뉴 배경, 보조 버튼 배경

  // Semantic
  danger:      '#E5484D',
  dangerDark:  '#C13B3F',
  dangerTint:  '#FDECEC',
  warning:     '#E0902B',
  warningDark: '#C77B1E',
  warningTint: '#FBF0DF',
  success:     '#1E9E6A',
  successDark: '#1A8757',
  successTint: '#E6F5EE',

  // Neutral
  bg:          '#F4F6F9',   // 페이지 배경
  white:       '#FFFFFF',   // 카드 배경
  border:      '#E6E9EF',   // 카드 테두리
  borderRow:   '#F0F2F6',   // 표 행 구분선
  borderDiv:   '#E7EAF0',   // 섹션 구분
  text:        '#1A2230',   // 본문 (짙음)
  textSub:     '#586173',   // 본문 보조
  muted:       '#5F6B7A',   // 캡션, 메타 (WCAG AA 4.5:1 이상)
  chipNeutral: '#EEF1F6',   // 중립 배지 배경
  chipText:    '#3A4660',   // 중립 배지 텍스트
}

// ── 그림자 ───────────────────────────────────────────────
export const shadow = {
  card: '0 1px 3px rgba(16,24,40,.06)',
  modal: '0 16px 44px rgba(16,24,40,.14)',
}

// ── 공통 인풋 스타일 ─────────────────────────────────────
export const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: `1px solid ${C.border}`,
  boxSizing: 'border-box',
  fontSize: '13px',
  color: C.text,
  background: C.white,
  outline: 'none',
  transition: 'border-color 0.15s',
  fontFamily: 'inherit',
}

export const labelStyle = {
  display: 'block',
  marginBottom: '5px',
  fontSize: '11.5px',
  fontWeight: '600',
  color: C.textSub,
  letterSpacing: '0.02em',
}

// ── 버튼 스타일 ──────────────────────────────────────────
export const btnPrimary = {
  background: C.blue,
  color: C.white,
  border: 'none',
  padding: '8px 18px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '600',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
}

export const btnGhost = {
  background: C.white,
  color: C.textSub,
  border: `1px solid ${C.border}`,
  padding: '8px 18px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
}

// 엑셀 내보내기 버튼 — 앱 전체에서 동일한 모양/문구로 사용(시약 목록·구매요청서 등).
// 라벨은 '📊 Excel로 내보내기'로 통일.
export const btnExcel = {
  background: '#1D6F42',
  color: C.white,
  border: 'none',
  padding: '10px 18px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: '600',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
}

export const btnDanger = {
  background: C.dangerTint,
  color: C.dangerDark,
  border: `1px solid #F3D6D6`,
  padding: '8px 18px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: 'inherit',
  fontWeight: '600',
}

// 요청 버튼 (대시보드 재고부족 행)
export const btnRequest = {
  fontSize: '11.5px',
  fontWeight: '600',
  color: C.blue,
  background: C.blueTint,
  border: 'none',
  padding: '6px 11px',
  borderRadius: '7px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
}

// ── 테이블 스타일 ─────────────────────────────────────────
export const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  borderBottom: `1px solid ${C.border}`,
  fontSize: '11.5px',
  color: C.muted,
  fontWeight: '600',
  letterSpacing: '0.03em',
  background: C.bg,
  whiteSpace: 'nowrap',
}

export const tdStyle = {
  padding: '11px 14px',
  borderBottom: `1px solid ${C.borderRow}`,
  fontSize: '13px',
  color: C.text,
  verticalAlign: 'middle',
}

// ── Material Symbol 아이콘 컴포넌트 ─────────────────────
export function Icon({ name, size = 20, color, style = {} }) {
  return (
    <span
      className="ms"
      style={{
        fontSize: `${size}px`,
        color: color,
        lineHeight: 1,
        ...style,
      }}
    >
      {name}
    </span>
  )
}

// ── 페이지 배너 ──────────────────────────────────────────
// ── Breadcrumb ───────────────────────────────────────────
// 실제 라우트 계층만 보여주는 클릭 가능한 경로. 항상 "홈"(/)으로 시작하므로 items 에 '홈'을 넣지 않는다(넣어도 무시).
// item: '문자열'(링크 없음) | { label, to, onClick } — to 가 있으면 Link, onClick 이 있으면 클릭을 가로채 그 동작을 실행
//   (시약 상세의 "시약 목록"은 목록 화면의 검색·필터·스크롤을 복원하려고 navigate(-1) 을 쓴다).
// 마지막 항목 = 현재 페이지(aria-current="page", 링크 아님). items 가 비면 "홈" 자체가 현재 페이지.
export function Breadcrumb({ items = [] }) {
  const list = items.filter(Boolean).map(b => (typeof b === 'string' ? { label: b } : b)).filter((b, i) => !(i === 0 && b.label === '홈'))
  // 글자 크기·줄 높이(28px)는 그대로 두고, 터치 영역만 padding 으로 키운 뒤 같은 크기의 음수 margin 으로 상쇄한다(≈44px 터치 타깃, 레이아웃 높이 불변).
  const linkStyle = { color: C.muted, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', minHeight: '44px', padding: '0 6px', margin: '-8px -6px' }
  return (
    <nav aria-label="현재 위치" style={{ paddingTop: '10px', marginBottom: '6px' }}>
      <ol style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px', margin: 0, padding: 0, listStyle: 'none', fontSize: '12px', color: C.muted }}>
        <li style={{ display: 'flex', alignItems: 'center' }}>
          {list.length === 0
            ? <span aria-current="page" style={{ ...linkStyle, color: C.textSub }}><span aria-hidden="true" style={{ display: 'inline-flex' }}><Icon name="home" size={15} color={C.muted} /></span>홈</span>
            : <Link to="/" style={linkStyle}><span aria-hidden="true" style={{ display: 'inline-flex' }}><Icon name="home" size={15} color={C.muted} /></span>홈</Link>}
        </li>
        {list.map((b, i) => {
          const last = i === list.length - 1
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span aria-hidden="true">›</span>
              {last ? <span aria-current="page" style={{ color: C.textSub, overflowWrap: 'anywhere' }}>{b.label}</span>
                : b.to ? <Link to={b.to} onClick={b.onClick ? (e => { e.preventDefault(); b.onClick() }) : undefined} style={linkStyle}>{b.label}</Link>
                  : <span style={{ overflowWrap: 'anywhere' }}>{b.label}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// back: { label, onClick } — 제목 위에 항상 보이는 "← 상위 화면" 버튼(브라우저 뒤로가기를 몰라도 돌아갈 수 있게).
export function PageBanner({ title, sub, breadcrumb = [], extra, back }) {
  return (
    <div style={{
      background: C.white,
      borderBottom: `1px solid ${C.border}`,
      padding: '0 clamp(16px, 4vw, 24px)',
    }}>
      <Breadcrumb items={breadcrumb} />
      {back && (
        <div style={{ marginBottom: '8px' }}>
          <button type="button" onClick={back.onClick} aria-label={back.ariaLabel || back.label} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '8px 14px', borderRadius: '8px',
            border: `1px solid ${C.border}`, background: C.white, color: C.navy, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
          }}>← {back.label}</button>
        </div>
      )}
      {/* title row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px 16px',
        paddingBottom: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 10px', minWidth: 0, maxWidth: '100%' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: C.navyDeep, letterSpacing: '-0.4px', overflowWrap: 'anywhere', minWidth: 0 }}>
            {title}
          </h1>
          {sub && (
            <span style={{ fontSize: '11px', color: C.muted, fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {sub}
            </span>
          )}
        </div>
        {extra}
      </div>
    </div>
  )
}

// ── 카드 컨테이너 ────────────────────────────────────────
export function Card({ title, sub, extra, children, noPadding, style = {} }) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: '12px',
      boxShadow: shadow.card,
      overflow: 'hidden',
      ...style,
    }}>
      {title && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px 20px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div>
            <div style={{ fontSize: '14.5px', fontWeight: '700', color: C.navyDeep }}>{title}</div>
            {sub && <div style={{ fontSize: '11.5px', color: C.muted, marginTop: '1px' }}>{sub}</div>}
          </div>
          {extra}
        </div>
      )}
      <div style={noPadding ? {} : { padding: '18px 20px' }}>{children}</div>
    </div>
  )
}

// ── 상태 뱃지 ────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    pending:   { label: '대기중',   bg: C.warningTint,  color: C.warningDark },
    approved:  { label: '승인됨',   bg: C.successTint,  color: C.successDark },
    rejected:  { label: '반려됨',   bg: C.dangerTint,   color: C.dangerDark  },
    ordered:   { label: '발주완료', bg: '#EDE7F6',       color: '#4527A0'     },
    delivered: { label: '배송완료', bg: C.blueTint,      color: C.blueDark    },
    done:      { label: '완료',     bg: C.chipNeutral,  color: C.chipText    },
  }
  const s = map[status] || { label: status, bg: C.chipNeutral, color: C.chipText }
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      padding: '3px 10px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

// ── 재고 막대 ─────────────────────────────────────────────
export function StockBar({ pct }) {
  const fill = pct < 10 ? C.danger : pct < 30 ? C.warning : C.success
  return (
    <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: C.borderRow, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: fill, borderRadius: '3px' }} />
    </div>
  )
}

// ── 모달 래퍼 ────────────────────────────────────────────
export function Modal({ open, onClose, title, width = 520, children }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(16,24,40,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        ref={el => { if (el && !el.contains(document.activeElement)) el.focus() }}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        style={{
        background: C.white,
        borderRadius: '14px',
        boxShadow: shadow.modal,
        width: '100%',
        maxWidth: width,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        outline: 'none',
      }}>
        {/* header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 22px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: C.navyDeep }}>{title}</span>
          <button
            onClick={onClose} aria-label="닫기"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.muted, padding: '4px', borderRadius: '6px',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {/* body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// ── 빈 상태 ──────────────────────────────────────────────
export function EmptyState({ icon = 'inbox', message = '데이터가 없습니다', sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: C.muted }}>
      <Icon name={icon} size={40} color={C.border} style={{ marginBottom: '12px' }} />
      <div style={{ fontSize: '14px', fontWeight: '600', color: C.textSub, marginBottom: sub ? '4px' : 0 }}>{message}</div>
      {sub && <div style={{ fontSize: '12.5px' }}>{sub}</div>}
    </div>
  )
}

// ── 로딩 스피너 ──────────────────────────────────────────
export function Spinner({ size = 24 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${C.border}`,
      borderTopColor: C.blue,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

// ── 검색 인풋 ────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = '검색…', style = {} }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <Icon name="search" size={16} color={C.muted} style={{
        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
      }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          ...inputStyle,
          paddingLeft: '32px',
          width: '100%',
        }}
      />
    </div>
  )
}

// ── 하위 호환 alias (기존 페이지들이 C.navy, C.gold를 쓰는 경우) ──
// C.navy → C.navy (이미 있음, 단 값 업데이트)
// 아래는 제거된 토큰들의 alias
Object.assign(C, {
  gold:       '#2F6BDB',   // 기존 gold → blue로 매핑 (포인트 색)
  goldLight:  '#EAF1FB',
  navyLight:  '#1F4E96',
  navyDark:   C.navyDeep,
  steelBlue:  C.blue,
})
