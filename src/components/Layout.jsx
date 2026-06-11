import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'

// ── 디자인 토큰 ──────────────────────────────────────
const C = {
  navy:       '#1a2a5e',
  navyDark:   '#111d42',
  navyLight:  '#2a3f7e',
  gold:       '#E8A020',
  goldLight:  '#F5C050',
  steelBlue:  '#4A6FA5',
  white:      '#FFFFFF',
  bg:         '#F0F2F7',
  border:     '#DDE2EE',
  text:       '#1C2B4A',
  muted:      '#6B7A99',
  danger:     '#D63031',
}

const NAV_ITEMS = [
  { to: '/',                  label: '홈',         sub: 'Home',             icon: '🏠', end: true },
  { to: '/reagents/locations',label: '시약장 위치', sub: 'Storage Location', icon: '📍' },
  { to: '/reagents/list',     label: '시약 목록',  sub: 'Reagent List',     icon: '🧪' },
  { to: '/items',             label: '물품 관리',  sub: 'Supplies',         icon: '📦' },
  { to: '/requests',          label: '구매 요청',  sub: 'Purchase Request', icon: '🛒' },
  { to: '/calendar',          label: '달력',       sub: 'Calendar',         icon: '📅' },
]

export default function Layout() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  function handleAdminLogin() {
    const pw = prompt('관리자 비밀번호를 입력하세요')
    if (pw === 'admin1234') { setIsAdmin(true) }
    else if (pw !== null) alert('비밀번호가 틀렸습니다')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh',
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif", background: C.bg }}>

      {/* ── 상단 헤더 ── */}
      <header style={{
        height: '56px', background: C.navy,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        boxShadow: '0 2px 12px rgba(26,42,94,0.3)',
      }}>
        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', background: C.gold,
            borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '900', fontSize: '16px', color: C.navy, letterSpacing: '-1px',
          }}>K</div>
          <div>
            <div style={{ color: C.white, fontWeight: '700', fontSize: '14px', lineHeight: 1.2 }}>
              연구실 시약관리 시스템
            </div>
            <div style={{ color: C.gold, fontSize: '10px', letterSpacing: '0.06em', opacity: 0.9 }}>
              LAB CHEMICAL MANAGEMENT
            </div>
          </div>
        </div>

        {/* 우측: 관리자 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAdmin ? (
            <>
              <NavLink to="/admin" style={{ color: C.goldLight, textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
                ⚙️ 관리자 페이지
              </NavLink>
              <button onClick={() => setIsAdmin(false)} style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)',
                color: C.white, padding: '5px 14px', borderRadius: '5px',
                cursor: 'pointer', fontSize: '12px',
              }}>로그아웃</button>
            </>
          ) : (
            <button onClick={handleAdminLogin} style={{
              background: 'transparent', border: `1px solid ${C.gold}`,
              color: C.gold, padding: '5px 14px', borderRadius: '5px',
              cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.target.style.background = C.gold; e.target.style.color = C.navy }}
              onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = C.gold }}
            >🔐 관리자 로그인</button>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', marginTop: '56px', minHeight: 'calc(100vh - 56px)' }}>

        {/* ── 사이드바 ── */}
        <aside style={{
          width: '220px', background: C.white,
          borderRight: `1px solid ${C.border}`,
          position: 'fixed', top: '56px', left: 0,
          height: 'calc(100vh - 56px)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* 메뉴 섹션 타이틀 */}
          <div style={{
            padding: '20px 20px 10px',
            fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em',
            color: C.muted, textTransform: 'uppercase',
          }}>메뉴</div>

          {/* 일반 메뉴 */}
          {NAV_ITEMS.map(({ to, label, sub, icon, end }) => {
            const isActive = end
              ? location.pathname === to
              : location.pathname.startsWith(to)
            return (
              <NavLink key={to} to={to} end={end} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '11px 20px',
                  background: isActive ? '#EEF2FB' : 'transparent',
                  borderLeft: isActive ? `3px solid ${C.gold}` : '3px solid transparent',
                  transition: 'background 0.12s',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F7FC' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{icon}</span>
                  <div>
                    <div style={{
                      fontSize: '13px', fontWeight: isActive ? '700' : '500',
                      color: isActive ? C.navy : C.text, lineHeight: 1.3,
                    }}>{label}</div>
                    <div style={{ fontSize: '10px', color: C.muted, letterSpacing: '0.03em' }}>{sub}</div>
                  </div>
                  {isActive && (
                    <div style={{ marginLeft: 'auto', width: '6px', height: '6px',
                      borderRadius: '50%', background: C.gold }} />
                  )}
                </div>
              </NavLink>
            )
          })}

          {/* 구분선 */}
          {isAdmin && (
            <>
              <div style={{ margin: '12px 20px', borderTop: `1px solid ${C.border}` }} />
              <div style={{
                padding: '4px 20px 10px',
                fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em',
                color: C.muted, textTransform: 'uppercase',
              }}>관리자</div>
              <NavLink to="/admin" style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '11px 20px',
                  background: location.pathname.startsWith('/admin') ? '#EEF2FB' : 'transparent',
                  borderLeft: location.pathname.startsWith('/admin') ? `3px solid ${C.gold}` : '3px solid transparent',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F5F7FC'}
                  onMouseLeave={e => e.currentTarget.style.background =
                    location.pathname.startsWith('/admin') ? '#EEF2FB' : 'transparent'}
                >
                  <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>⚙️</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>관리자 메뉴</div>
                    <div style={{ fontSize: '10px', color: C.muted }}>Admin Panel</div>
                  </div>
                </div>
              </NavLink>
            </>
          )}

          {/* 하단 버전 */}
          <div style={{ marginTop: 'auto', padding: '16px 20px',
            borderTop: `1px solid ${C.border}`, fontSize: '11px', color: C.muted }}>
            <div style={{ fontWeight: '600', marginBottom: '2px' }}>강원대학교</div>
            <div>과학교육학부 연구실</div>
          </div>
        </aside>

        {/* ── 메인 콘텐츠 ── */}
        <main style={{ marginLeft: '220px', flex: 1, minWidth: 0 }}>
          <Outlet context={{ isAdmin }} />
        </main>
      </div>
    </div>
  )
}
