import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useFCM } from '../hooks/useFCM'

const C = {
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
}

function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return {
    isMobile:  width < 480,
    isTablet:  width >= 480 && width <= 1024,
    isDesktop: width > 1024,
    width,
  }
}

const NAV_ITEMS = [
  { to: '/',                   label: '홈',         sub: 'Home',             icon: '🏠', end: true },
  { to: '/reagents/locations', label: '시약장 위치', sub: 'Storage Location', icon: '📍' },
  { to: '/reagents/list',      label: '시약 목록',  sub: 'Reagent List',     icon: '🧪' },
  { to: '/items',              label: '물품 관리',  sub: 'Supplies',         icon: '📦' },
  { to: '/requests',           label: '구매 요청',  sub: 'Purchase Request', icon: '🛒' },
  { to: '/calendar',           label: '달력',       sub: 'Calendar',         icon: '📅' },
  { to: '/inventory',          label: '재고 실사',  sub: 'Inventory Count',  icon: '📊' },
]

const BOTTOM_NAV = [
  { to: '/',              label: '홈',      icon: '🏠', end: true },
  { to: '/reagents/list', label: '시약',    icon: '🧪' },
  { to: '/items',         label: '물품',    icon: '📦' },
  { to: '/requests',      label: '구매요청', icon: '🛒' },
  { to: '/inventory',     label: '실사',    icon: '📊' },
]

export default function Layout() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuper, setIsSuper] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const { isMobile, isTablet, isDesktop } = useBreakpoint()

  useFCM(isAdmin || isSuper)

  async function handleAdminLogin() {
    const pw = prompt('관리자 비밀번호를 입력하세요')
    if (pw === null) return

    // DB에서 비밀번호 확인
    const { data } = await supabase.from('app_settings').select('key, value').in('key', ['admin_password', 'super_password'])
    const settings = {}
    data?.forEach(d => { settings[d.key] = d.value })

    if (pw === settings['super_password']) {
      setIsAdmin(true)
      setIsSuper(true)
    } else if (pw === settings['admin_password']) {
      setIsAdmin(true)
      setIsSuper(false)
    } else {
      alert('비밀번호가 틀렸습니다')
    }
  }

  function handleLogout() {
    setIsAdmin(false)
    setIsSuper(false)
  }

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  const sidebarWidth = isDesktop ? '220px' : isTablet ? '64px' : '0px'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
      background: C.bg,
    }}>
      <header style={{
        height: '52px', background: C.navy,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 16px' : '0 24px',
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        boxShadow: '0 2px 12px rgba(26,42,94,0.3)',
      }}>
        {isMobile && (
          <button onClick={() => setDrawerOpen(true)} style={{
            background: 'none', border: 'none', color: C.white,
            fontSize: '22px', cursor: 'pointer', padding: '4px',
          }}>☰</button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px', height: '30px', background: C.gold,
            borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '900', fontSize: '15px', color: C.navy,
          }}>K</div>
          {(!isMobile || drawerOpen) && (
            <div>
              <div style={{ color: C.white, fontWeight: '700', fontSize: isMobile ? '12px' : '14px', lineHeight: 1.2 }}>
                {isMobile ? '시약관리 시스템' : '연구실 시약관리 시스템'}
              </div>
              {!isMobile && (
                <div style={{ color: C.gold, fontSize: '10px', letterSpacing: '0.06em', opacity: 0.9 }}>
                  LAB CHEMICAL MANAGEMENT
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdmin ? (
            <>
              {!isMobile && (
                <NavLink to="/admin" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: C.goldLight, fontSize: '13px', fontWeight: '600' }}>
                    {isSuper ? '👑 슈퍼관리자' : '⚙️ 관리자'}
                  </span>
                </NavLink>
              )}
              <button onClick={handleLogout} style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)',
                color: C.white, padding: '4px 10px', borderRadius: '5px',
                cursor: 'pointer', fontSize: '12px',
              }}>로그아웃</button>
            </>
          ) : (
            <button onClick={handleAdminLogin} style={{
              background: 'transparent', border: `1px solid ${C.gold}`,
              color: C.gold, padding: '4px 10px', borderRadius: '5px',
              cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>🔐 {isMobile ? '' : '관리자 로그인'}</button>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', marginTop: '52px', minHeight: 'calc(100vh - 52px)' }}>

        {isTablet && (
          <aside style={{
            width: '64px', background: C.white,
            borderRight: `1px solid ${C.border}`,
            position: 'fixed', top: '52px', left: 0,
            height: 'calc(100vh - 52px)', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: '12px', gap: '4px', zIndex: 100,
          }}>
            {NAV_ITEMS.map(({ to, label, icon, end }) => {
              const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
              return (
                <NavLink key={to} to={to} end={end} title={label} style={{ textDecoration: 'none', width: '100%' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '10px 4px', gap: '3px',
                    background: isActive ? '#EEF2FB' : 'transparent',
                    borderLeft: isActive ? `3px solid ${C.gold}` : '3px solid transparent',
                    cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: '20px' }}>{icon}</span>
                    <span style={{ fontSize: '9px', color: isActive ? C.navy : C.muted, fontWeight: isActive ? '700' : '400', textAlign: 'center' }}>
                      {label.length > 4 ? label.slice(0, 4) : label}
                    </span>
                  </div>
                </NavLink>
              )
            })}
            {isAdmin && (
              <>
                <div style={{ width: '40px', borderTop: `1px solid ${C.border}`, margin: '8px 0' }} />
                <NavLink to="/admin" title="관리자" style={{ textDecoration: 'none', width: '100%' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '10px 4px', gap: '3px',
                    background: location.pathname.startsWith('/admin') ? '#EEF2FB' : 'transparent',
                    borderLeft: location.pathname.startsWith('/admin') ? `3px solid ${C.gold}` : '3px solid transparent',
                    cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: '20px' }}>{isSuper ? '👑' : '⚙️'}</span>
                    <span style={{ fontSize: '9px', color: C.muted }}>관리자</span>
                  </div>
                </NavLink>
              </>
            )}
          </aside>
        )}

        {isDesktop && (
          <aside style={{
            width: '220px', background: C.white,
            borderRight: `1px solid ${C.border}`,
            position: 'fixed', top: '52px', left: 0,
            height: 'calc(100vh - 52px)', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', zIndex: 100,
          }}>
            <div style={{ padding: '20px 20px 10px', fontSize: '10px', fontWeight: '700',
              letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>메뉴</div>

            {NAV_ITEMS.map(({ to, label, sub, icon, end }) => {
              const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
              return (
                <NavLink key={to} to={to} end={end} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '11px 20px',
                    background: isActive ? '#EEF2FB' : 'transparent',
                    borderLeft: isActive ? `3px solid ${C.gold}` : '3px solid transparent',
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F7FC' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500',
                        color: isActive ? C.navy : C.text, lineHeight: 1.3 }}>{label}</div>
                      <div style={{ fontSize: '10px', color: C.muted }}>{sub}</div>
                    </div>
                    {isActive && <div style={{ marginLeft: 'auto', width: '6px', height: '6px',
                      borderRadius: '50%', background: C.gold }} />}
                  </div>
                </NavLink>
              )
            })}

            {isAdmin && (
              <>
                <div style={{ margin: '12px 20px', borderTop: `1px solid ${C.border}` }} />
                <div style={{ padding: '4px 20px 10px', fontSize: '10px', fontWeight: '700',
                  letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>
                  {isSuper ? '👑 슈퍼관리자' : '관리자'}
                </div>
                <NavLink to="/admin" style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 20px',
                    background: location.pathname.startsWith('/admin') ? '#EEF2FB' : 'transparent',
                    borderLeft: location.pathname.startsWith('/admin') ? `3px solid ${C.gold}` : '3px solid transparent',
                    cursor: 'pointer',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F5F7FC'}
                    onMouseLeave={e => e.currentTarget.style.background =
                      location.pathname.startsWith('/admin') ? '#EEF2FB' : 'transparent'}
                  >
                    <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{isSuper ? '👑' : '⚙️'}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>관리자 메뉴</div>
                      <div style={{ fontSize: '10px', color: C.muted }}>Admin Panel</div>
                    </div>
                  </div>
                </NavLink>
              </>
            )}

            <div style={{ marginTop: 'auto', padding: '16px 20px',
              borderTop: `1px solid ${C.border}`, fontSize: '11px', color: C.muted }}>
              <div style={{ fontWeight: '600', marginBottom: '2px' }}>강원대학교</div>
              <div>과학교육학부 연구실</div>
            </div>
          </aside>
        )}

        {isMobile && drawerOpen && (
          <>
            <div onClick={() => setDrawerOpen(false)} style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(26,42,94,0.5)', zIndex: 300,
            }} />
            <div style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: '260px',
              background: C.white, zIndex: 400,
              display: 'flex', flexDirection: 'column',
              boxShadow: '4px 0 24px rgba(26,42,94,0.2)',
            }}>
              <div style={{ background: C.navy, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', background: C.gold, borderRadius: '5px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: '900', fontSize: '14px', color: C.navy }}>K</div>
                  <span style={{ color: C.white, fontWeight: '700', fontSize: '13px' }}>시약관리 시스템</span>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
                  fontSize: '20px', cursor: 'pointer', padding: '4px',
                }}>✕</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingTop: '8px' }}>
                <div style={{ padding: '8px 20px 6px', fontSize: '10px', fontWeight: '700',
                  letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>메뉴</div>
                {NAV_ITEMS.map(({ to, label, sub, icon, end }) => {
                  const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
                  return (
                    <NavLink key={to} to={to} end={end} style={{ textDecoration: 'none' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '13px 20px',
                        background: isActive ? '#EEF2FB' : 'transparent',
                        borderLeft: isActive ? `3px solid ${C.gold}` : '3px solid transparent',
                      }}>
                        <span style={{ fontSize: '18px' }}>{icon}</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: isActive ? '700' : '500',
                            color: isActive ? C.navy : C.text }}>{label}</div>
                          <div style={{ fontSize: '11px', color: C.muted }}>{sub}</div>
                        </div>
                      </div>
                    </NavLink>
                  )
                })}

                {isAdmin && (
                  <>
                    <div style={{ margin: '8px 20px', borderTop: `1px solid ${C.border}` }} />
                    <div style={{ padding: '4px 20px 6px', fontSize: '10px', fontWeight: '700',
                      letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>관리자</div>
                    <NavLink to="/admin" style={{ textDecoration: 'none' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 20px',
                        background: location.pathname.startsWith('/admin') ? '#EEF2FB' : 'transparent',
                        borderLeft: location.pathname.startsWith('/admin') ? `3px solid ${C.gold}` : '3px solid transparent',
                      }}>
                        <span style={{ fontSize: '18px' }}>{isSuper ? '👑' : '⚙️'}</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: C.text }}>관리자 메뉴</div>
                          <div style={{ fontSize: '11px', color: C.muted }}>Admin Panel</div>
                        </div>
                      </div>
                    </NavLink>
                  </>
                )}
              </div>

              <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.border}` }}>
                {isAdmin ? (
                  <button onClick={handleLogout} style={{
                    width: '100%', padding: '10px', borderRadius: '8px',
                    border: `1px solid ${C.border}`, background: C.white,
                    cursor: 'pointer', fontSize: '13px', color: C.muted,
                  }}>로그아웃</button>
                ) : (
                  <button onClick={handleAdminLogin} style={{
                    width: '100%', padding: '10px', borderRadius: '8px',
                    border: `1px solid ${C.gold}`, background: 'transparent',
                    cursor: 'pointer', fontSize: '13px', color: C.gold, fontWeight: '600',
                  }}>🔐 관리자 로그인</button>
                )}
                <div style={{ marginTop: '12px', fontSize: '11px', color: C.muted, textAlign: 'center' }}>
                  강원대학교 과학교육학부 연구실
                </div>
              </div>
            </div>
          </>
        )}

        <main style={{
          marginLeft: sidebarWidth,
          flex: 1, minWidth: 0,
          paddingBottom: isMobile ? '64px' : 0,
        }}>
          <Outlet context={{ isAdmin, isSuper }} />
        </main>
      </div>

      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: '60px',
          background: C.white, borderTop: `1px solid ${C.border}`,
          display: 'flex', zIndex: 200,
          boxShadow: '0 -2px 12px rgba(26,42,94,0.08)',
        }}>
          {BOTTOM_NAV.map(({ to, label, icon, end }) => {
            const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
            return (
              <NavLink key={to} to={to} end={end} style={{ flex: 1, textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: '60px', gap: '3px',
                  borderTop: isActive ? `2px solid ${C.gold}` : '2px solid transparent',
                }}>
                  <span style={{ fontSize: '20px' }}>{icon}</span>
                  <span style={{
                    fontSize: '10px', fontWeight: isActive ? '700' : '400',
                    color: isActive ? C.navy : C.muted,
                  }}>{label}</span>
                </div>
              </NavLink>
            )
          })}
          <button onClick={() => setDrawerOpen(true)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '3px', border: 'none', background: 'none', cursor: 'pointer',
            borderTop: '2px solid transparent',
          }}>
            <span style={{ fontSize: '20px' }}>☰</span>
            <span style={{ fontSize: '10px', color: C.muted }}>더보기</span>
          </button>
        </nav>
      )}
    </div>
  )
}