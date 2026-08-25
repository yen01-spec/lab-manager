import Notices from './pages/Notices'
import Safety from './pages/Safety'
import { Routes, Route, useOutletContext } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import ReagentLocations from './pages/ReagentLocations'
import ReagentList from './pages/ReagentList'
import Items from './pages/Items'
import Requests from './pages/Requests'
import Admin from './pages/Admin'
import Inventory from './pages/Inventory'
import NoticeDetail from './pages/NoticeDetail'
import PurchaseRequest from './pages/PurchaseRequest'
import BulkEdit from './pages/BulkEdit'
import ReagentDetail from './pages/ReagentDetail'

// isAdmin이 확정되기 전엔 관리자 화면을 렌더링하지 않는다 (한 프레임도 노출 안 함).
function RequireAdmin({ children }) {
  const { isAdmin } = useOutletContext()
  if (!isAdmin) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9AA1AD', fontSize: 14 }}>
        관리자만 접근할 수 있습니다.
      </div>
    )
  }
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="reagents/locations" element={<ReagentLocations />} />
        <Route path="reagents/list" element={<ReagentList />} />
        <Route path="reagents/:id" element={<ReagentDetail />} />
        <Route path="reagents/bulk-edit" element={<RequireAdmin><BulkEdit /></RequireAdmin>} />
        <Route path="items" element={<Items />} />
        <Route path="requests" element={<Requests />} />
        <Route path="purchase-request" element={<PurchaseRequest />} />
        <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="notices" element={<Notices />} />
        <Route path="notices/:id" element={<NoticeDetail />} />
<Route path="safety/:id" element={<NoticeDetail />} />
        <Route path="safety" element={<Safety />} />
      </Route>
    </Routes>
  )
}
export default App