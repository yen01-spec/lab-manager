import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useFCM } from '../hooks/useFCM'
import { C, Icon } from '../design'

function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const h = () => setWidth(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return { isMobile: width < 768, isTablet: width >= 768 && width < 1100, isDesktop: width >= 1100 }
}

const NAV_ITEMS = [
  { to: '/',                   label: '홈',         icon: 'home',          end: true },
  { to: '/reagents/locations', label: '시약장 위치', icon: 'location_on'            },
  { to: '/reagents/list',      label: '시약 목록',  icon: 'science'                },
  { to: '/items',              label: '물품 관리',  icon: 'inventory_2'            },
  { to: '/requests',           label: '구매 요청',  icon: 'shopping_cart'          },
  { to: '/inventory',          label: '재고 실사',  icon: 'checklist'              },
  { to: '/notices',            label: '공지사항',   icon: 'campaign'               },
  { to: '/safety',             label: '안전관리',   icon: 'health_and_safety'      },
]

const BOTTOM_NAV = [
  { to: '/',              label: '홈',    icon: 'home',         end: true },
  { to: '/reagents/list', label: '시약',  icon: 'science'               },
  { to: '/items',         label: '물품',  icon: 'inventory_2'           },
  { to: '/requests',      label: '구매',  icon: 'shopping_cart'         },
  { to: '/inventory',     label: '실사',  icon: 'checklist'             },
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
    const { data } = await supabase.from('app_settings').select('key, value').in('key', ['admin_password', 'super_password'])
    const s = {}; data?.forEach(d => { s[d.key] = d.value })
    if (pw === s['super_password']) { setIsAdmin(true); setIsSuper(true) }
    else if (pw === s['admin_password']) { setIsAdmin(true); setIsSuper(false) }
    else alert('비밀번호가 틀렸습니다')
  }

  function handleLogout() { setIsAdmin(false); setIsSuper(false) }
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  const sidebarW = isDesktop ? 210 : isTablet ? 60 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>

      {/* ── 헤더 ── */}
      <header style={{
        height: 56, background: C.navy,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 16px' : '0 22px',
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
      }}>
        {/* 왼쪽: 햄버거(모바일) + 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isMobile && (
            <button onClick={() => setDrawerOpen(true)} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
            }}>
              <Icon name="menu" size={22} color="rgba(255,255,255,0.8)" />
            </button>
          )}
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: C.blue,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 15, color: '#fff',
          }}>K</div>
          {!isMobile && (
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>연구실 시약관리 시스템</div>
              <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '1.4px', color: '#8497B8' }}>LAB CHEMICAL MANAGEMENT</div>
            </div>
          )}
        </div>

        {/* 오른쪽: 로그인 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isAdmin ? (
            <>
              {!isMobile && (
                <NavLink to="/admin" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#B8C9E8', fontSize: 13, fontWeight: 600 }}>
                    {isSuper ? '슈퍼관리자' : '관리자'}
                  </span>
                </NavLink>
              )}
              <button onClick={handleLogout} style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.8)', padding: '5px 12px', borderRadius: 7,
                cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}>로그아웃</button>
            </>
          ) : (
            <button onClick={handleAdminLogin} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.8)', padding: '5px 12px', borderRadius: 7,
              cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}>
              {isMobile ? '로그인' : '관리자 로그인'}
            </button>
          )}
        </div>
      </header>

      {/* ── 본문 ── */}
      <div style={{ display: 'flex', marginTop: 56, minHeight: 'calc(100vh - 56px)' }}>

        {/* 데스크톱 사이드바 */}
        {isDesktop && (
          <SidebarDesktop
            items={NAV_ITEMS} isAdmin={isAdmin} isSuper={isSuper}
            location={location}
          />
        )}

        {/* 태블릿 미니 사이드바 */}
        {isTablet && (
          <SidebarMini items={NAV_ITEMS} isAdmin={isAdmin} isSuper={isSuper} location={location} />
        )}

        {/* 모바일 드로어 */}
        {isMobile && drawerOpen && (
          <Drawer
            items={NAV_ITEMS} isAdmin={isAdmin} isSuper={isSuper}
            onClose={() => setDrawerOpen(false)}
            onAdminLogin={handleAdminLogin} onLogout={handleLogout}
            location={location}
          />
        )}

        <main style={{
          marginLeft: sidebarW,
          flex: 1, minWidth: 0,
          paddingBottom: isMobile ? 64 : 0,
        }}>
          <Outlet context={{ isAdmin, isSuper }} />
        </main>
      </div>

      {/* 모바일 바텀 탭 */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 60,
          background: C.white, borderTop: `1px solid ${C.border}`,
          display: 'flex', zIndex: 200,
          boxShadow: '0 -1px 8px rgba(16,24,40,0.07)',
        }}>
          {BOTTOM_NAV.map(({ to, label, icon, end }) => {
            const active = end ? location.pathname === to : location.pathname.startsWith(to)
            return (
              <NavLink key={to} to={to} end={end} style={{ flex: 1, textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', height: 60, gap: 3,
                  borderTop: active ? `2px solid ${C.blue}` : '2px solid transparent',
                }}>
                  <Icon name={icon} size={22} color={active ? C.blue : C.muted} />
                  <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? C.blueDark : C.muted }}>
                    {label}
                  </span>
                </div>
              </NavLink>
            )
          })}
          <button onClick={() => setDrawerOpen(true)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer',
            borderTop: '2px solid transparent',
          }}>
            <Icon name="menu" size={22} color={C.muted} />
            <span style={{ fontSize: 10, color: C.muted }}>더보기</span>
          </button>
        </nav>
      )}
    </div>
  )
}

// ── 서브 컴포넌트 ─────────────────────────────────────────

function NavItem({ to, label, icon, end, location, compact = false }) {
  const active = end ? location.pathname === to : location.pathname.startsWith(to)
  return (
    <NavLink to={to} end={end} style={{ textDecoration: 'none' }}>
      {compact ? (
        <div title={label} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '10px 4px', gap: 3,
          background: active ? C.blueTint : 'transparent',
          borderLeft: active ? `3px solid ${C.blue}` : '3px solid transparent',
          cursor: 'pointer',
        }}>
          <Icon name={icon} size={21} color={active ? C.blue : '#9AA1AD'} />
          <span style={{ fontSize: 9, color: active ? C.blueDark : '#9AA1AD', fontWeight: active ? 700 : 400, textAlign: 'center' }}>
            {label.length > 4 ? label.slice(0, 4) : label}
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 9,
            background: active ? C.blueTint : 'transparent',
            cursor: 'pointer', transition: 'background 0.12s',
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F0F4FD' }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
        >
          <Icon name={icon} size={20} color={active ? C.blue : '#9AA1AD'} />
          <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500, color: active ? C.blueDark : '#586173' }}>
            {label}
          </span>
        </div>
      )}
    </NavLink>
  )
}

function SidebarDesktop({ items, isAdmin, isSuper, location }) {
  return (
    <aside style={{
      width: 210, background: C.white, borderRight: `1px solid ${C.border}`,
      position: 'fixed', top: 56, left: 0, height: 'calc(100vh - 56px)',
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
      zIndex: 100,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#A7AEBA', letterSpacing: '0.4px', padding: '18px 14px 8px' }}>메뉴</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
        {items.map(item => <NavItem key={item.to} {...item} location={location} />)}
        {isAdmin && (
          <>
            <div style={{ margin: '10px 2px', borderTop: `1px solid ${C.border}` }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: '#A7AEBA', letterSpacing: '0.4px', padding: '0 2px 6px' }}>
              {isSuper ? '슈퍼관리자' : '관리자'}
            </div>
            <NavItem to="/admin" label="관리자 메뉴" icon="admin_panel_settings" location={location} />
          </>
        )}
      </nav>
      <div style={{ marginTop: 'auto', padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#3A4250' }}>강원대학교</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>과학교육학부 연구실</div>
      </div>
    </aside>
  )
}

function SidebarMini({ items, isAdmin, isSuper, location }) {
  return (
    <aside style={{
      width: 60, background: C.white, borderRight: `1px solid ${C.border}`,
      position: 'fixed', top: 56, left: 0, height: 'calc(100vh - 56px)',
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 8, gap: 2, zIndex: 100,
    }}>
      {items.map(item => <NavItem key={item.to} {...item} location={location} compact />)}
      {isAdmin && (
        <>
          <div style={{ width: 36, borderTop: `1px solid ${C.border}`, margin: '6px 0' }} />
          <NavItem to="/admin" label="관리자" icon="admin_panel_settings" location={location} compact />
        </>
      )}
    </aside>
  )
}

function Drawer({ items, isAdmin, isSuper, onClose, onAdminLogin, onLogout, location }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', zIndex: 300,
      }} />
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
        background: C.white, zIndex: 400, display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(16,24,40,0.15)',
      }}>
        <div style={{ background: C.navy, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff' }}>K</div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>시약관리 시스템</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="close" size={20} color="rgba(255,255,255,0.6)" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#A7AEBA', letterSpacing: '0.4px', padding: '6px 2px 8px' }}>메뉴</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map(item => <NavItem key={item.to} {...item} location={location} />)}
            {isAdmin && (
              <>
                <div style={{ margin: '8px 2px', borderTop: `1px solid ${C.border}` }} />
                <NavItem to="/admin" label="관리자 메뉴" icon="admin_panel_settings" location={location} />
              </>
            )}
          </nav>
        </div>
        <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
          {isAdmin ? (
            <button onClick={onLogout} style={{
              width: '100%', padding: 10, borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.white,
              cursor: 'pointer', fontSize: 13, color: C.muted, fontFamily: 'inherit',
            }}>로그아웃</button>
          ) : (
            <button onClick={onAdminLogin} style={{
              width: '100%', padding: 10, borderRadius: 8,
              border: `1px solid rgba(47,107,219,0.4)`, background: C.blueTint,
              cursor: 'pointer', fontSize: 13, color: C.blueDark, fontWeight: 600, fontFamily: 'inherit',
            }}>관리자 로그인</button>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: C.muted, textAlign: 'center' }}>
            강원대학교 과학교육학부 연구실
          </div>
        </div>
      </div>
    </>
  )
}
