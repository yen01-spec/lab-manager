import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useFCM } from '../hooks/useFCM'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { C, Icon } from '../design'
import { readSession, revalidateSession, logoutSession } from '../lib/session'
import LoginModal from './LoginModal'
import AdminLoginModal from './AdminLoginModal'
import { useAdminSessionState } from '../hooks/useAdminSession'
import { AdminSessionContext } from '../hooks/adminSessionContext'
import { signOutAdmin } from '../lib/adminAuth'

const NAV_ITEMS = [
  { to: '/',                 label: '홈',        icon: 'home',          end: true },
  { to: '/reagents/list',    label: '시약',      icon: 'science'                },
  { to: '/inventory',        label: '재고실사',  icon: 'checklist'              },
  { to: '/purchase-request', label: '구매요청서', icon: 'shopping_cart'         },
  { to: '/resources',        label: '자료실',    icon: 'campaign'               },
]

const BOTTOM_NAV = NAV_ITEMS

export default function Layout() {
  const [session, setSession] = useState(() => readSession())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hamRef = useRef(null)
  // Esc/×/배경 클릭으로 닫을 때만 햄버거로 포커스를 돌려준다(로그인 모달을 여는 닫기는 모달이 포커스를 가져간다).
  const closeDrawerToButton = () => { setDrawerOpen(false); setTimeout(() => hamRef.current?.focus(), 0) }
  const [loginOpen, setLoginOpen] = useState(false)
  const [adminLoginOpen, setAdminLoginOpen] = useState(false)
  const adminSession = useAdminSessionState()
  const location = useLocation()
  const { isMobile, isTablet, isDesktop } = useBreakpoint()

  // 관리자 = Supabase Auth 로그인 + admin_users 등록(DB의 public.is_admin()와 같은 근거). 학생 로그인과 별개.
  const isAdmin = adminSession.authed
  const student = session ? { student_id: session.student_id, name: session.name, session_token: session.session_token } : null

  useFCM(isAdmin)

  useEffect(() => {
    revalidateSession().then(setSession)
  }, [])

  async function handleAdminLogout() {
    await signOutAdmin()
    adminSession.refresh()
  }

  function handleLogout() {
    setSession(null)
    logoutSession() // best-effort 서버 세션 revoke(비동기, 응답 안 기다림) + localStorage clear
  }
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  const sidebarW = isDesktop ? 210 : isTablet ? 60 : 0
  const navItems = NAV_ITEMS

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
            <button ref={hamRef} onClick={() => setDrawerOpen(true)} aria-label="메뉴 열기" aria-expanded={drawerOpen} style={{
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

        {/* 오른쪽: 관리자 로그인 / 학생 로그인 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isMobile && (isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NavLink to="/admin" style={{ textDecoration: 'none' }}>
                <span style={{ color: '#B8C9E8', fontSize: 12 }}>관리자 · {adminSession.email}</span>
              </NavLink>
              <button onClick={handleAdminLogout} style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.8)', padding: '5px 12px', borderRadius: 7,
                cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}>관리자 로그아웃</button>
            </div>
          ) : adminSession.ready && (
            <button onClick={() => setAdminLoginOpen(true)} style={{
              background: 'none', border: 'none', color: '#8FA6D4', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}>관리자 로그인</button>
          ))}
          {session ? (
            <>
              {!isMobile && <span style={{ color: '#DCE4F2', fontSize: 13, fontWeight: 600 }}>{session.name}님</span>}
              <button onClick={handleLogout} style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.8)', padding: '5px 12px', borderRadius: 7,
                cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}>로그아웃</button>
            </>
          ) : (
            <button onClick={() => setLoginOpen(true)} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.8)', padding: '5px 12px', borderRadius: 7,
              cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}>
              로그인
            </button>
          )}
        </div>
      </header>

      {/* ── 본문 ── */}
      <div style={{ display: 'flex', marginTop: 56, minHeight: 'calc(100vh - 56px)' }}>

        {/* 데스크톱 사이드바 */}
        {isDesktop && (
          <SidebarDesktop
            items={navItems} isAdmin={isAdmin}
            location={location}
          />
        )}

        {/* 태블릿 미니 사이드바 */}
        {isTablet && (
          <SidebarMini items={navItems} isAdmin={isAdmin} location={location} />
        )}

        {/* 모바일 드로어 */}
        {isMobile && drawerOpen && (
          <Drawer
            items={navItems} isAdmin={isAdmin} session={session} adminEmail={adminSession.email}
            onClose={closeDrawerToButton}
            onLogin={() => setLoginOpen(true)}
            onAdminLogin={() => { setDrawerOpen(false); setAdminLoginOpen(true) }}
            onAdminLogout={handleAdminLogout}
            onLogout={handleLogout}
            location={location}
          />
        )}

        <main style={{
          marginLeft: sidebarW,
          flex: 1, minWidth: 0,
          paddingBottom: isMobile ? 64 : 0,
        }}>
          {/* applySession: 자식 페이지가 자체적으로 로그인을 확인한 뒤(예: 등록 버튼 누를 때
              인라인으로 뜨는 로그인란) 헤더/전역 세션에도 곧바로 반영할 수 있게 노출 */}
          <AdminSessionContext.Provider value={adminSession}>
            <Outlet context={{ isAdmin, student, applySession: setSession, adminSession }} />
          </AdminSessionContext.Provider>
        </main>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSuccess={setSession} onAdminLogin={() => setAdminLoginOpen(true)} />
      <AdminLoginModal open={adminLoginOpen} onClose={() => setAdminLoginOpen(false)} onSuccess={adminSession.refresh} />

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
          <Icon name={icon} size={21} color={active ? C.blueDark : '#5F6B7A'} />
          <span style={{ fontSize: 9, color: active ? C.blueDark : '#5F6B7A', fontWeight: active ? 700 : 400, textAlign: 'center' }}>
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
          <Icon name={icon} size={20} color={active ? C.blueDark : '#5F6B7A'} />
          <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500, color: active ? C.blueDark : '#586173' }}>
            {label}
          </span>
        </div>
      )}
    </NavLink>
  )
}

function SidebarDesktop({ items, isAdmin, location }) {
  return (
    <aside style={{
      width: 210, background: C.white, borderRight: `1px solid ${C.border}`,
      position: 'fixed', top: 56, left: 0, height: 'calc(100vh - 56px)',
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
      zIndex: 100,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5F6B7A', letterSpacing: '0.4px', padding: '18px 14px 8px' }}>메뉴</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
        {items.map(item => <NavItem key={item.to} {...item} location={location} />)}
        {isAdmin && (
          <>
            <div style={{ margin: '10px 2px', borderTop: `1px solid ${C.border}` }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: '#5F6B7A', letterSpacing: '0.4px', padding: '0 2px 6px' }}>
              관리자
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

function SidebarMini({ items, isAdmin, location }) {
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

function Drawer({ items, isAdmin, session, adminEmail, onClose, onLogin, onAdminLogin, onAdminLogout, onLogout, location }) {
  const panelRef = useRef(null)
  // 모바일 메뉴 = 모달 대화상자: 열리면 키보드 포커스를 안으로, 뒤 화면 스크롤 잠금, Esc 로 닫기, Tab 은 메뉴 안에서만 순환.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button[aria-label="메뉴 닫기"]')?.focus()
    return () => { document.body.style.overflow = prev }
  }, [])
  function onKeyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab') return
    const f = [...panelRef.current.querySelectorAll('a[href], button:not([disabled])')]
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', zIndex: 300,
      }} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="메뉴" onKeyDown={onKeyDown} style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
        background: C.white, zIndex: 400, display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(16,24,40,0.15)',
      }}>
        <div style={{ background: C.navy, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff' }}>K</div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>시약관리 시스템</span>
          </div>
          <button onClick={onClose} aria-label="메뉴 닫기" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="close" size={20} color="rgba(255,255,255,0.6)" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5F6B7A', letterSpacing: '0.4px', padding: '6px 2px 8px' }}>메뉴</div>
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
            <div style={{ marginBottom: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6, wordBreak: 'break-all' }}>관리자 · {adminEmail}</div>
              <button onClick={onAdminLogout} style={{
                width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white,
                cursor: 'pointer', fontSize: 13, color: C.muted, fontFamily: 'inherit',
              }}>관리자 로그아웃</button>
            </div>
          ) : (
            <button onClick={onAdminLogin} style={{
              width: '100%', padding: 10, borderRadius: 8, marginBottom: 10,
              border: `1px solid ${C.border}`, background: C.white,
              cursor: 'pointer', fontSize: 13, color: C.blueDark, fontWeight: 600, fontFamily: 'inherit',
            }}>관리자 로그인</button>
          )}
          {session ? (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 8, textAlign: 'center' }}>
                {session.name}님
              </div>
              <button onClick={onLogout} style={{
                width: '100%', padding: 10, borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.white,
                cursor: 'pointer', fontSize: 13, color: C.muted, fontFamily: 'inherit',
              }}>로그아웃</button>
            </>
          ) : (
            <button onClick={onLogin} style={{
              width: '100%', padding: 10, borderRadius: 8,
              border: `1px solid rgba(47,107,219,0.4)`, background: C.blueTint,
              cursor: 'pointer', fontSize: 13, color: C.blueDark, fontWeight: 600, fontFamily: 'inherit',
            }}>로그인</button>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: C.muted, textAlign: 'center' }}>
            강원대학교 과학교육학부 연구실
          </div>
        </div>
      </div>
    </>
  )
}
