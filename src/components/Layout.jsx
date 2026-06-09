import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'

function Layout() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [reagentOpen, setReagentOpen] = useState(false)
  const location = useLocation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* 상단 바 */}
      <div style={{
        height: '48px', background: '#1e3a5f', color: 'white',
        display: 'flex', alignItems: 'center', padding: '0 24px',
        justifyContent: 'space-between', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>🧪 연구실 시약관리 시스템</span>
        <div>
          {isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <NavLink to="/admin" style={{ color: '#90cdf4', textDecoration: 'none', fontSize: '14px' }}>관리자 페이지</NavLink>
              <button onClick={() => setIsAdmin(false)} style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
                color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
              }}>로그아웃</button>
            </div>
          ) : (
            <button onClick={() => {
              const pw = prompt('관리자 비밀번호를 입력하세요')
              if (pw === 'admin1234') setIsAdmin(true)
              else if (pw !== null) alert('비밀번호가 틀렸습니다')
            }} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
              color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
            }}>🔐 관리자 로그인</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', marginTop: '48px', minHeight: 'calc(100vh - 48px)' }}>
        {/* 사이드바 */}
        <div style={{
          width: '200px', background: '#f8f9fa', borderRight: '1px solid #e2e8f0',
          position: 'fixed', top: '48px', left: 0, height: 'calc(100vh - 48px)',
          overflowY: 'auto', padding: '16px 0', textAlign: 'left' 
        }}>
          {[
            { to: '/', label: '🏠 홈' },
            { to: '/calendar', label: '📅 달력' },
          ].map(({ to, label }) => (
            <NavLink key={to} to={to} end style={({ isActive }) => ({
              display: 'block', padding: '10px 20px',
              color: isActive ? '#1e3a5f' : '#4a5568',
              background: isActive ? '#e2e8f0' : 'transparent',
              textDecoration: 'none', fontSize: '14px',
              fontWeight: isActive ? 'bold' : 'normal',
              borderLeft: isActive ? '3px solid #1e3a5f' : '3px solid transparent',
            })}>
              {label}
            </NavLink>
          ))}

          {/* 시약 관리 드롭다운 */}
          <div>
            <div onClick={() => setReagentOpen(!reagentOpen)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 20px', cursor: 'pointer', fontSize: '14px',
              color: location.pathname.startsWith('/reagents') ? '#1e3a5f' : '#4a5568',
              background: location.pathname.startsWith('/reagents') ? '#e2e8f0' : 'transparent',
              borderLeft: location.pathname.startsWith('/reagents') ? '3px solid #1e3a5f' : '3px solid transparent',
              fontWeight: location.pathname.startsWith('/reagents') ? 'bold' : 'normal',
            }}>
              <span>🧪 시약 관리</span>
              <span>{reagentOpen ? '▲' : '▼'}</span>
            </div>
            {(reagentOpen || location.pathname.startsWith('/reagents')) && (
              <div style={{ background: '#f0f4f8' }}>
                <NavLink to="/reagents/locations" style={({ isActive }) => ({
                  display: 'block', padding: '8px 20px 8px 32px',
                  color: isActive ? '#1e3a5f' : '#666',
                  textDecoration: 'none', fontSize: '13px',
                  fontWeight: isActive ? 'bold' : 'normal',
                })}>📍 실험실·시약장 위치</NavLink>
                <NavLink to="/reagents/list" style={({ isActive }) => ({
                  display: 'block', padding: '8px 20px 8px 32px',
                  color: isActive ? '#1e3a5f' : '#666',
                  textDecoration: 'none', fontSize: '13px',
                  fontWeight: isActive ? 'bold' : 'normal',
                })}>📋 시약 목록</NavLink>
              </div>
            )}
          </div>

          {[
            { to: '/items', label: '🔬 물품 관리' },
            { to: '/requests', label: '🛒 구매 요청' },
          ].map(({ to, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'block', padding: '10px 20px',
              color: isActive ? '#1e3a5f' : '#4a5568',
              background: isActive ? '#e2e8f0' : 'transparent',
              textDecoration: 'none', fontSize: '14px',
              fontWeight: isActive ? 'bold' : 'normal',
              borderLeft: isActive ? '3px solid #1e3a5f' : '3px solid transparent',
            })}>
              {label}
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink to="/admin" style={({ isActive }) => ({
              display: 'block', padding: '10px 20px',
              color: isActive ? '#1e3a5f' : '#4a5568',
              background: isActive ? '#e2e8f0' : 'transparent',
              textDecoration: 'none', fontSize: '14px',
              fontWeight: isActive ? 'bold' : 'normal',
              borderLeft: isActive ? '3px solid #1e3a5f' : '3px solid transparent',
            })}>⚙️ 관리자</NavLink>
          )}
        </div>

        <main style={{ marginLeft: '200px', flex: 1, padding: '24px', background: '#f7fafc' }}>
          <Outlet context={{ isAdmin }} />
        </main>
      </div>
    </div>
  )
}

export default Layout