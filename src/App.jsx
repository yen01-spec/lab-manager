import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Reagents from './pages/Reagents'
import ReagentDetail from './pages/ReagentDetail'
import Items from './pages/Items'
import ItemDetail from './pages/ItemDetail'
import Requests from './pages/Requests'
import Admin from './pages/Admin'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="reagents" element={<Reagents />} />
        <Route path="reagents/:id" element={<ReagentDetail />} />
        <Route path="items" element={<Items />} />
        <Route path="items/:id" element={<ItemDetail />} />
        <Route path="requests" element={<Requests />} />
        <Route path="admin" element={<Admin />} />
      </Route>
    </Routes>
  )
}

export default App
