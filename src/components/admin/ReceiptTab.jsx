import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary, thStyle, tdStyle } from '../../design'

// ══════════════════════════════════════════════
//  영수증 관리
// ══════════════════════════════════════════════
export default function ReceiptTab() {
  const [receipts, setReceipts] = useState([])
  const [form, setForm] = useState({ title: '', doc_type: 'receipt', date: '', notes: '', file_url: '' })
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  useEffect(() => { fetchReceipts() }, [])

  async function fetchReceipts() {
    const { data } = await supabase.from('receipts').select('*').order('date', { ascending: false })
    if (data) setReceipts(data)
  }

  async function upload() {
    if (!form.title.trim()) { alert('제목을 입력해주세요'); return }
    if (!form.date) { alert('날짜를 입력해주세요'); return }
    setUploading(true)
    let fileUrl = ''
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()
      const fileName = `receipts/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(fileName, selectedFile)
      if (error) { alert('파일 업로드 실패: ' + error.message); setUploading(false); return }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
      fileUrl = urlData?.publicUrl || ''
    }
    await supabase.from('receipts').insert({
      title: form.title, doc_type: form.doc_type, date: form.date, notes: form.notes,
      file_url: fileUrl || form.file_url || null,
    })
    alert('등록되었습니다!')
    setForm({ title: '', doc_type: 'receipt', date: '', notes: '', file_url: '' })
    setSelectedFile(null)
    setUploading(false)
    fetchReceipts()
  }

  async function del(id) {
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('receipts').delete().eq('id', id)
    fetchReceipts()
  }

  const typeLabel = { receipt: '영수증', estimate: '견적서', statement: '거래명세서', other: '기타' }
  const typeColor = { receipt: '#38A169', estimate: '#667EEA', statement: '#E8A020', other: '#A0AEC0' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title="🧾 서류 등록">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div><label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: Ethanol 구매 영수증" style={inputStyle} /></div>
          <div><label style={labelStyle}>서류 종류</label>
            <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} style={inputStyle}>
              <option value="receipt">영수증</option><option value="estimate">견적서</option>
              <option value="statement">거래명세서</option><option value="other">기타</option>
            </select></div>
          <div><label style={labelStyle}>날짜 *</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>비고</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>파일 첨부 (이미지/PDF)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setSelectedFile(e.target.files[0])} style={{ ...inputStyle, padding: '6px' }} />
            {selectedFile && <p style={{ margin: '4px 0 0', fontSize: '12px', color: C.muted }}>선택됨: {selectedFile.name}</p>}
            <label style={{ ...labelStyle, marginTop: '8px' }}>또는 URL 직접 입력</label>
            <input value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." style={inputStyle} />
          </div>
        </div>
        <button onClick={upload} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중...' : '등록'}
        </button>
      </Card>
      <Card title="📁 서류 목록" noPadding>
        {receipts.length === 0 ? <p style={{ padding: '20px', color: C.muted }}>등록된 서류가 없습니다.</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['날짜','종류','제목','비고','파일','삭제'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{receipts.map(r => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.date}</td>
                  <td style={tdStyle}><span style={{ background: typeColor[r.doc_type] + '22', color: typeColor[r.doc_type], padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>{typeLabel[r.doc_type]}</span></td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{r.title}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{r.notes || '-'}</td>
                  <td style={tdStyle}>{r.file_url ? <a href={r.file_url} target="_blank" rel="noreferrer" style={{ color: C.navy, fontSize: '13px' }}>📎 보기</a> : <span style={{ color: C.muted, fontSize: '12px' }}>없음</span>}</td>
                  <td style={tdStyle}><button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer' }}>✕</button></td>
                </tr>
              ))}</tbody>
            </table>}
      </Card>
    </div>
  )
}
