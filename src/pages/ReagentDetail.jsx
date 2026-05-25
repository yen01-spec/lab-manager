import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

function ReagentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useOutletContext()
  const [reagent, setReagent] = useState(null)
  const [lots, setLots] = useState([])
  const [logs, setLogs] = useState([])
  const [userName, setUserName] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const { data: r } = await supabase
      .from('reagents')
      .select('*, locations(*)')
      .eq('id', id)
      .single()
    if (r) setReagent(r)

    const { data: l } = await supabase
      .from('reagent_lots')
      .select('*')
      .eq('reagent_id', id)
    if (l) setLots(l)

    const { data: lg } = await supabase
      .from('stock_logs')
      .select('*')
      .eq('target_type', 'reagent')
      .order('changed_at', { ascending: false })
      .limit(20)
    if (lg) setLogs(lg.filter(log => l?.some(lot => lot.id === log.lot_id)))
  }

  async function updateStock(lot, field, value) {
    if (!userName.trim()) { alert('이름을 입력해주세요'); return }
    const before_sealed = lot.sealed_count
    const before_stock = lot.current_stock
    const updated = { ...lot, [field]: value }

    await supabase.from('reagent_lots').update({ [field]: value }).eq('id', lot.id)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent',
      lot_id: lot.id,
      user_name: userName,
      before_sealed,
      after_sealed: updated.sealed_count,
      before_stock,
      after_stock: updated.current_stock,
      notes
    })
    fetchData()
    setNotes('')
  }

  if (!reagent) return <p>로딩 중...</p>

  return (
    <div>
      <button onClick={() => navigate(-1)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#1e3a5f', fontSize: '16px', marginBottom: '16px'
      }}>← 뒤로</button>

      <h1 style={{ color: '#1e3a5f', marginBottom: '4px' }}>{reagent.name}</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        {reagent.locations?.room} {reagent.locations?.detail && '- ' + reagent.locations.detail}
      </p>

      {/* 기본 정보 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
        {[
          ['CAS No.', reagent.cas_no],
          ['회사', reagent.company],
          ['유별/성질', reagent.category],
          ['용량', reagent.volume + ' ' + reagent.unit],
          ['유해·위험성', reagent.hazard],
          ['비고', reagent.notes],
        ].map(([label, value]) => (
          <div key={label} style={{ background: '#f7fafc', borderRadius: '6px', padding: '12px' }}>
            <div style={{ color: '#999', fontSize: '12px' }}>{label}</div>
            <div style={{ fontWeight: 'bold' }}>{value || '-'}</div>
          </div>
        ))}
      </div>

      {/* 재고 변경 입력 */}
      <div style={{ background: '#ebf8ff', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0 }}>재고 변경</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            placeholder="이름 (필수)"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bee3f8', flex: 1 }}
          />
          <input
            placeholder="변경 사유 (선택)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #bee3f8', flex: 2 }}
          />
        </div>
      </div>

      {/* Lot별 재고 */}
      <h2 style={{ color: '#1e3a5f' }}>Lot별 재고</h2>
      {lots.map(lot => (
        <div key={lot.id} style={{
          border: '1px solid #e2e8f0', borderRadius: '8px',
          padding: '16px', marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontWeight: 'bold' }}>Lot No. {lot.lot_no || '-'}</span>
            <span style={{ color: '#666', fontSize: '14px' }}>
              유통기한: {lot.expiry_date || '-'} | 입고일: {lot.received_date || '-'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#666', fontSize: '13px', marginBottom: '4px' }}>미개봉 병 수</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => updateStock(lot, 'sealed_count', Math.max(0, lot.sealed_count - 1))}
                  style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #cbd5e0', cursor: 'pointer', background: 'white' }}>-</button>
                <span style={{ fontWeight: 'bold', fontSize: '18px', minWidth: '32px', textAlign: 'center' }}>{lot.sealed_count}</span>
                <button onClick={() => updateStock(lot, 'sealed_count', lot.sealed_count + 1)}
                  style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid #cbd5e0', cursor: 'pointer', background: 'white' }}>+</button>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ color: '#666', fontSize: '13px', marginBottom: '4px' }}>
                사용 중 잔량: {lot.current_stock}%
              </div>
              <input
                type="range" min="0" max="100" step="10"
                value={lot.current_stock}
                onChange={e => updateStock(lot, 'current_stock', Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999' }}>
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          </div>

          {lot.sealed_count === 0 && lot.current_stock <= 20 && (
            <div style={{ marginTop: '8px', color: '#e53e3e', fontWeight: 'bold' }}>⚠️ 재고 부족</div>
          )}
        </div>
      ))}

      {/* 변경 이력 */}
      <h2 style={{ color: '#1e3a5f', marginTop: '32px' }}>변경 이력</h2>
      {logs.length === 0 ? (
        <p style={{ color: '#999' }}>변경 이력이 없습니다.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f7fafc' }}>
              {['일시', '작성자', '미개봉', '잔량', '사유'].map(h => (
                <th key={h} style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                  {new Date(log.changed_at).toLocaleString()}
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>{log.user_name}</td>
                <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>
                  {log.before_sealed} → {log.after_sealed}
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>
                  {log.before_stock}% → {log.after_stock}%
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', color: '#666' }}>{log.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default ReagentDetail
