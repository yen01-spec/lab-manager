import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, btnGhost, thStyle, tdStyle } from '../../design'

// ══════════════════════════════════════════════
//  로그
// ══════════════════════════════════════════════
export default function LogTab() {
  const [logs, setLogs] = useState([])
  const [stockLogs, setStockLogs] = useState([])
  const [logTab, setLogTab] = useState('admin')

  useEffect(() => { fetchLogs() }, [logTab])

  async function fetchLogs() {
    if (logTab === 'admin') {
      const { data } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(100)
      if (data) setLogs(data)
    } else {
      const { data } = await supabase.from('stock_logs').select('*, reagent_lots(lot_no, reagents(name))').order('created_at', { ascending: false }).limit(100)
      if (data) setStockLogs(data)
    }
  }

  return (
    <Card title="📋 변경 로그" sub="Change Logs">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[['admin','관리자 작업 로그'],['stock','재고 수정 로그']].map(([key, label]) => (
          <button key={key} onClick={() => setLogTab(key)} style={{
            ...btnGhost, background: logTab === key ? C.navy : '#fff',
            color: logTab === key ? '#fff' : C.text, border: `1px solid ${logTab === key ? C.navy : C.border}`,
          }}>{label}</button>
        ))}
      </div>
      {logTab === 'admin' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['일시','작업자','작업','대상','내용'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {logs.length === 0
              ? <tr><td colSpan={5} style={{ padding: '20px', color: C.muted, textAlign: 'center' }}>로그가 없습니다</td></tr>
              : logs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.admin_name}</td>
                  <td style={tdStyle}><span style={{ background: '#EBF8FF', color: '#2B6CB0', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{l.action}</span></td>
                  <td style={{ ...tdStyle, color: C.muted }}>{l.target_type}</td>
                  <td style={tdStyle}>{l.description}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {logTab === 'stock' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['일시','작업자','시약','Lot','미개봉 변경','잔량 변경'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {stockLogs.length === 0
              ? <tr><td colSpan={6} style={{ padding: '20px', color: C.muted, textAlign: 'center' }}>로그가 없습니다</td></tr>
              : stockLogs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.user_name}</td>
                  <td style={tdStyle}>{l.reagent_lots?.reagents?.name || '-'}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{l.reagent_lots?.lot_no || '-'}</td>
                  <td style={tdStyle}>{l.before_sealed} → <strong>{l.after_sealed}</strong></td>
                  <td style={tdStyle}>{l.before_stock}% → <strong>{l.after_stock}%</strong></td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
