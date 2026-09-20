import Notices from './pages/Notices'
import Safety from './pages/Safety'
import Resources from './pages/Resources'
import { Routes, Route, Navigate, Link, useOutletContext } from 'react-router-dom'
import Layout from './components/Layout'
import AdminAuthBanner from './components/admin/AdminAuthBanner'
import Home from './pages/Home'
import ReagentLocations from './pages/ReagentLocations'
import ReagentList from './pages/ReagentList'
import Admin from './pages/Admin'
import Inventory from './pages/Inventory'
import NoticeDetail from './pages/NoticeDetail'
import PurchaseRequest from './pages/PurchaseRequest'
import PurchaseRequestList from './pages/PurchaseRequestList'
import BulkEdit from './pages/BulkEdit'
import ReagentDetail from './pages/ReagentDetail'
import SafetySignage from './pages/SafetySignage'

// 관리자 화면은 Supabase Auth 관리자 로그인(admin_users, DB의 public.is_admin())이 확인된 뒤에만 렌더링한다.
// (세션 확인 중엔 아무것도 노출하지 않고, 확인 후 미로그인이면 로그인 폼을 보여준다.)
function RequireAdmin({ children }) {
  const { isAdmin, adminSession } = useOutletContext()
  if (!adminSession?.ready) {
    return <div style={{ padding: '60px 20px', textAlign: 'center', color: '#5F6B7A', fontSize: 14 }}>관리자 로그인 상태를 확인하는 중…</div>
  }
  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px' }}>
        <div style={{ textAlign: 'center', color: '#586173', fontSize: 14, marginBottom: 16 }}>관리자 로그인 후 이용할 수 있습니다.</div>
        <AdminAuthBanner session={adminSession} purpose="관리자 메뉴를 사용" />
      </div>
    )
  }
  return children
}

// 없는 주소(오래된 북마크 등)는 빈 화면 대신 안내 + 홈 링크
function NotFound() {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
      <h1 style={{ fontSize: 18, color: '#1A2230', marginBottom: 8 }}>페이지를 찾을 수 없습니다</h1>
      <p style={{ fontSize: 13.5, color: '#5F6B7A', marginBottom: 20 }}>주소가 바뀌었거나 삭제된 페이지일 수 있어요.</p>
      <Link to="/" style={{ display: 'inline-block', padding: '11px 20px', borderRadius: 8, background: '#16233E', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>홈으로</Link>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="reagents/locations" element={<ReagentLocations />} />
        <Route path="reagents/list" element={<ReagentList />} />
        <Route path="reagents/:id" element={<ReagentDetail />} />
        <Route path="reagents/bulk-edit" element={<BulkEdit />} />
        <Route path="safety-signage" element={<SafetySignage />} />
        {/* 구 구매요청 화면(purchase_requests)은 폐기됨 — 옛 링크/북마크는 구매요청서로 안내 */}
        <Route path="requests" element={<Navigate to="/purchase-request" replace />} />
        <Route path="purchase-request" element={<PurchaseRequest />} />
        <Route path="purchase-request/list" element={<PurchaseRequestList />} />
        <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="resources" element={<Resources />} />
        <Route path="notices" element={<Notices />} />
        <Route path="notices/:id" element={<NoticeDetail />} />
<Route path="safety/:id" element={<NoticeDetail />} />
        <Route path="safety" element={<Safety />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
export default App