import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

const HOLIDAYS = [
  { date: '2025-03-01', name: '삼일절' },
  { date: '2025-05-05', name: '어린이날' },
  { date: '2025-06-06', name: '현충일' },
  { date: '2025-08-15', name: '광복절' },
  { date: '2025-10-03', name: '개천절' },
  { date: '2025-10-09', name: '한글날' },
  { date: '2026-01-01', name: '신정' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-05-05', name: '어린이날' },
]

const EVENT_TYPES = [
  { value: 'academic', label: '학사일정', color: '#667eea', bg: '#ebf4ff' },
  { value: 'lab', label: '연구실',   color: '#38a169', bg: '#f0fff4' },
  { value: 'etc', label: '기타',     color: '#ed8936', bg: '#fffaf0' },
]

function Calendar() {
  const { isAdmin } = useOutletContext?.() || {}
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState({ date: '', title: '', type: 'academic' })
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => { fetchEvents() }, [year, month])

  async function fetchEvents() {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const to   = `${year}-${String(month + 1).padStart(2, '0')}-31`
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .gte('date', from).lte('date', to)
      .order('date')
    if (data) setEvents(data)
  }

  async function addEvent() {
    if (!newEvent.date || !newEvent.title.trim()) { alert('날짜와 제목을 입력하세요'); return }
    await supabase.from('calendar_events').insert({
      date: newEvent.date, title: newEvent.title, type: newEvent.type,
    })
    setNewEvent({ date: '', title: '', type: 'academic' })
    setShowForm(false)
    fetchEvents()
  }

  async function deleteEvent(id, e) {
    e.stopPropagation()
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('calendar_events').delete().eq('id', id)
    fetchEvents()
  }

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const dateStr = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const getEntriesForDay = (day) => {
    const ds = dateStr(day)
    const holidays = HOLIDAYS.filter(h => h.date === ds).map(h => ({ ...h, type: 'holiday', id: 'h_' + h.date }))
    const custom   = events.filter(e => e.date === ds)
    return [...holidays, ...custom]
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  // 선택된 날 일정
  const selectedEntries = selectedDay ? getEntriesForDay(selectedDay) : []

  const typeInfo = (type) => EVENT_TYPES.find(t => t.value === type) || { color: '#a0aec0', bg: '#f7fafc', label: type }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ color: '#1e3a5f', margin: 0 }}>📅 달력</h1>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} style={{
            background: '#1e3a5f', color: 'white', border: 'none',
            padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600',
          }}>+ 일정 추가</button>
        )}
      </div>

      {/* 월 이동 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}>◀</button>
        <span style={{ fontSize: '18px', fontWeight: '700', color: '#1e3a5f' }}>{year}년 {month + 1}월</span>
        <button onClick={nextMonth} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}>▶</button>
        <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', color: '#718096' }}>
          오늘
        </button>
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <LegendItem color="#e53e3e" label="공휴일" />
        {EVENT_TYPES.map(t => <LegendItem key={t.value} color={t.color} label={t.label} />)}
      </div>

      {/* 캘린더 그리드 */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#1e3a5f' }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} style={{ padding: '10px', textAlign: 'center', fontWeight: '700', fontSize: '13px',
              color: i === 0 ? '#fc8181' : i === 6 ? '#90cdf4' : 'white' }}>{d}</div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            const isSelected = day === selectedDay
            const entries = day ? getEntriesForDay(day) : []
            const isSun = i % 7 === 0
            const isSat = i % 7 === 6
            return (
              <div key={i}
                onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                style={{
                  minHeight: '80px', padding: '6px', cursor: day ? 'pointer' : 'default',
                  borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
                  background: isSelected ? '#ebf4ff' : day ? 'white' : '#f7fafc',
                }}>
                {day && (
                  <>
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isToday ? '#1e3a5f' : 'transparent',
                      color: isToday ? 'white' : isSun ? '#e53e3e' : isSat ? '#3182ce' : '#2d3748',
                      fontWeight: isToday ? '700' : '400', fontSize: '13px', marginBottom: '4px',
                    }}>{day}</div>
                    {entries.slice(0, 3).map((ev, j) => {
                      const ti = ev.type === 'holiday' ? { color: '#e53e3e', bg: '#fff5f5' } : typeInfo(ev.type)
                      return (
                        <div key={j} style={{
                          fontSize: '10px', padding: '2px 4px', borderRadius: '3px', marginBottom: '2px',
                          background: ti.bg, color: ti.color, fontWeight: '500',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{ev.name || ev.title}</div>
                      )
                    })}
                    {entries.length > 3 && (
                      <div style={{ fontSize: '10px', color: '#a0aec0' }}>+{entries.length - 3}개</div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 선택된 날 상세 */}
      {selectedDay && (
        <div style={{ marginTop: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: '15px' }}>
              {month + 1}월 {selectedDay}일 일정
            </h3>
            {isAdmin && (
              <button onClick={() => { setNewEvent({ ...newEvent, date: dateStr(selectedDay) }); setShowForm(true) }}
                style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                + 추가
              </button>
            )}
          </div>
          {selectedEntries.length === 0
            ? <p style={{ color: '#a0aec0', margin: 0 }}>일정이 없습니다.</p>
            : selectedEntries.map(ev => {
              const ti = ev.type === 'holiday' ? { color: '#e53e3e', bg: '#fff5f5', label: '공휴일' } : typeInfo(ev.type)
              return (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', marginBottom: '6px',
                  background: ti.bg, borderRadius: '6px', borderLeft: `3px solid ${ti.color}` }}>
                  <span style={{ fontSize: '11px', color: ti.color, fontWeight: '600', minWidth: '50px' }}>{ti.label}</span>
                  <span style={{ flex: 1, fontSize: '14px', color: '#2d3748' }}>{ev.name || ev.title}</span>
                  {isAdmin && ev.type !== 'holiday' && (
                    <button onClick={(e) => deleteEvent(ev.id, e)}
                      style={{ background: 'none', border: 'none', color: '#a0aec0', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* 일정 추가 모달 (관리자 전용) */}
      {showForm && isAdmin && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '12px', padding: '32px',
            width: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ marginTop: 0, color: '#1e3a5f' }}>일정 추가</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#718096' }}>날짜 *</label>
              <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#718096' }}>종류</label>
              <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#718096' }}>일정 이름 *</label>
              <input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="예: 중간고사, 실험 마감"
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white' }}>취소</button>
              <button onClick={addEvent}
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: '#1e3a5f', color: 'white', cursor: 'pointer', fontWeight: '700' }}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color }} />
      <span style={{ fontSize: '12px', color: '#718096' }}>{label}</span>
    </div>
  )
}

export default Calendar
