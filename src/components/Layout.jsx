import { Outlet, NavLink } from 'react-router-dom'
import { useState } from 'react'

function Layout() {
  const [isAdmin, setIsAdmin] = useState(false)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* 왼쪽 사이드바 */}
      <div style={{
        width: '220px', background: '#1e3a5f', color: 'white',
        display: 'flex', flexDirection: 'column', padding: '24px 0',
        position: 'fixed', top: 0, left: 0, height: '100vh'
      }}>
        {/* 로고 */}
        <div style={{ padding: '0 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>🧪 시약관리</div>
        </div>

        {/* 메뉴 */}
        <nav style={{ flex: 1, padding: '16px 0' }}>
          {[
            { to: '/', label: '🏠 홈' },
            { to: '/reagents', label: '🧪 시약 관리' },
            { to: '/items', label: '🔬 물품 관리' },
            { to: '/requests', label: '🛒 구매 요청' },
          ].map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'block', padding: '12px 24px',
              color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
              background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              textDecoration: 'none', fontSize: '15px',
              borderLeft: isActive ? '3px solid white' : '3px solid transparent',
              transition: 'all 0.2s'
            })}>
              {label}
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink to="/admin" style={({ isActive }) => ({
              display: 'block', padding: '12px 24px',
              color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
              background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              textDecoration: 'none', fontSize: '15px',
              borderLeft: isActive ? '3px solid white' : '3px solid transparent',
            })}>
              ⚙️ 관리자 페이지
            </NavLink>
          )}
        </nav>

        {/* 관리자 로그인 */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {isAdmin ? (
            <div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                관리자 모드
              </div>
              <button onClick={() => setIsAdmin(false)} style={{
                width: '100%', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.4)',
                color: 'white', padding: '8px', borderRadius: '6px', cursor: 'pointer'
              }}>로그아웃</button>
            </div>
          ) : (
            <button onClick={() => {
              const pw = prompt('관리자 비밀번호를 입력하세요')
              if (pw === 'admin1234') setIsAdmin(true)
              else if (pw !== null) alert('비밀번호가 틀렸습니다')
            }} style={{
              width: '100%', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.4)',
              color: 'white', padding: '8px', borderRadius: '6px', cursor: 'pointer'
            }}>🔐 관리자 로그인</button>
          )}
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <main style={{ marginLeft: '220px', flex: 1, padding: '32px', background: '#f7fafc', minHeight: '100vh' }}>
        <Outlet context={{ isAdmin }} />
      </main>
    </div>
  )
}

export default Layout