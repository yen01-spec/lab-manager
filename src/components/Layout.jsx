import { Outlet, NavLink } from 'react-router-dom'
import { useState } from 'react'

function Layout() {
  const [isAdmin, setIsAdmin] = useState(false)

  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh' }}>
      {/* 상단 네비게이션 */}
      <nav style={{
        background: '#1e3a5f',
        color: 'white',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>🧪 시약관리</span>
          <NavLink to="/" style={({ isActive }) => ({
            color: isActive ? '#90cdf4' : 'white', textDecoration: 'none'
          })}>홈</NavLink>
          <NavLink to="/reagents" style={({ isActive }) => ({
            color: isActive ? '#90cdf4' : 'white', textDecoration: 'none'
          })}>시약</NavLink>
          <NavLink to="/items" style={({ isActive }) => ({
            color: isActive ? '#90cdf4' : 'white', textDecoration: 'none'
          })}>물품</NavLink>
          <NavLink to="/requests" style={({ isActive }) => ({
            color: isActive ? '#90cdf4' : 'white', textDecoration: 'none'
          })}>구매요청</NavLink>
        </div>
        <div>
          {isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px' }}>관리자 모드</span>
              <NavLink to="/admin" style={{ color: '#90cdf4', textDecoration: 'none' }}>관리자 페이지</NavLink>
              <button onClick={() => setIsAdmin(false)} style={{
                background: 'transparent', border: '1px solid white',
                color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer'
              }}>로그아웃</button>
            </div>
          ) : (
            <button onClick={() => {
              const pw = prompt('관리자 비밀번호를 입력하세요')
              if (pw === 'admin1234') setIsAdmin(true)
              else if (pw !== null) alert('비밀번호가 틀렸습니다')
            }} style={{
              background: 'transparent', border: '1px solid white',
              color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer'
            }}>관리자 로그인</button>
          )}
        </div>
      </nav>

      {/* 페이지 내용 */}
      <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <Outlet context={{ isAdmin }} />
      </main>
    </div>
  )
}

export default Layout
