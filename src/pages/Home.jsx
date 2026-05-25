import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function Home() {
  const [notices, setNotices] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [expiringSoon, setExpiringSoon] = useState([])

  useEffect(() => {
    fetchNotices()
    fetchLowStock()
    fetchExpiringSoon()
  }, [])

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setNotices(data)
  }

  async function fetchLowStock() {
    const { data } = await supabase
      .from('reagent_lots')
      .select('*, reagents(name)')
      .eq('sealed_count', 0)
      .lte('current_stock', 20)
    if (data) setLowStock(data)
  }

  async function fetchExpiringSoon() {
    const today = new Date()
    const soon = new Date()
    soon.setDate(today.getDate() + 30)
    const { data } = await supabase
      .from('reagent_lots')
      .select('*, reagents(name)')
      .lte('expiry_date', soon.toISOString().split('T')[0])
      .gte('expiry_date', today.toISOString().split('T')[0])
    if (data) setExpiringSoon(data)
  }

  return (
    <div>
      {/* 책임자 정보 */}
      <div style={{
        background: '#1e3a5f', color: 'white',
        borderRadius: '8px', padding: '16px 24px',
        marginBottom: '24px'
      }}>
        <h2 style={{ margin: '0 0 8px 0' }}>📋 연구실 책임자</h2>
        <p style={{ margin: 0 }}>교수님: OOO 교수 | 담당 조교: OOO | 연락처: 000-0000-0000</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* 공지사항 */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
          <h2 style={{ margin: '0 0 16px 0', color: '#1e3a5f' }}>📢 공지사항</h2>
          {notices.length === 0 ? (
            <p style={{ color: '#999' }}>공지사항이 없습니다.</p>
          ) : (
            notices.map(n => (
              <div key={n.id} style={{
                borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px'
              }}>
                <div style={{ fontWeight: 'bold' }}>{n.title}</div>
                <div style={{ color: '#666', fontSize: '14px' }}>{n.content}</div>
                <div style={{ color: '#999', fontSize: '12px' }}>
                  {new Date(n.created_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 재고 부족 */}
          <div style={{ border: '1px solid #fed7d7', borderRadius: '8px', padding: '16px', background: '#fff5f5' }}>
            <h2 style={{ margin: '0 0 16px 0', color: '#c53030' }}>⚠️ 재고 부족</h2>
            {lowStock.length === 0 ? (
              <p style={{ color: '#999' }}>재고 부족 시약이 없습니다.</p>
            ) : (
              lowStock.map(l => (
                <div key={l.id} style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>{l.reagents?.name}</span>
                  <span style={{ color: '#c53030', marginLeft: '8px' }}>
                    잔량 {l.current_stock}%
                  </span>
                </div>
              ))
            )}
          </div>

          {/* 유통기한 임박 */}
          <div style={{ border: '1px solid #fbd38d', borderRadius: '8px', padding: '16px', background: '#fffbeb' }}>
            <h2 style={{ margin: '0 0 16px 0', color: '#b7791f' }}>⏰ 유통기한 임박 (30일)</h2>
            {expiringSoon.length === 0 ? (
              <p style={{ color: '#999' }}>임박한 시약이 없습니다.</p>
            ) : (
              expiringSoon.map(e => (
                <div key={e.id} style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>{e.reagents?.name}</span>
                  <span style={{ color: '#b7791f', marginLeft: '8px' }}>
                    {e.expiry_date}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
