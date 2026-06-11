import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import ReagentLocations from './pages/ReagentLocations'
import ReagentList from './pages/ReagentList'
import Items from './pages/Items'
import Requests from './pages/Requests'
import Admin from './pages/Admin'
import Calendar from './pages/Calendar'
import Inventory from './pages/Inventory'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reagents/locations" element={<ReagentLocations />} />
        <Route path="reagents/list" element={<ReagentList />} />
        <Route path="items" element={<Items />} />
        <Route path="requests" element={<Requests />} />
        <Route path="admin" element={<Admin />} />
        <Route path="inventory" element={<Inventory />} />
      </Route>
    </Routes>
  )
}
export default App