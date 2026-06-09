import { useState } from 'react'

const HOLIDAYS = [
  { date: '2025-03-01', name: '삼일절' },
  { date: '2025-05-05', name: '어린이날' },
  { date: '2025-06-06', name: '현충일' },
  { date: '2025-08-15', name: '광복절' },
  { date: '2025-10-03', name: '개천절' },
  { date: '2025-10-09', name: '한글날' },
]

function Calendar() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState({ date: '', title: '' })

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const getEventsForDay = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const holidays = HOLIDAYS.filter(h => h.date === dateStr)
    const custom = events.filter(e => e.date === dateStr)
    return [...holidays.map(h => ({ ...h, type: 'holiday' })), ...custom.map(e => ({ ...e, type: 'event' }))]
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ color: '#1e3a5f', margin: 0 }}>📅 달력</h1>
        <button onClick={() => setShowForm(true)} style={{
          background: '#1e3a5f', color: 'white', border: 'none',
          padding: '8px 16px', borderRadius: '6px', cursor: 'pointer'
        }}>+ 일정 추가</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer' }}>◀</button>
        <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{year}년 {month + 1}월</span>
        <button onClick={nextMonth} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer' }}>▶</button>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#1e3a5f' }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} style={{ padding: '10px', textAlign: 'center', color: i === 0 ? '#fc8181' : i === 6 ? '#90cdf4' : 'white', fontWeight: 'bold', fontSize: '13px' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            const dayEvents = day ? getEventsForDay(day) : []
            const isSun = i % 7 === 0
            const isSat = i % 7 === 6
            return (
              <div key={i} style={{
                minHeight: '80px', padding: '8px', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
                background: day ? 'white' : '#f7fafc'
              }}>
                {day && (
                  <>
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isToday ? '#1e3a5f' : 'transparent',
                      color: isToday ? 'white' : isSun ? '#e53e3e' : isSat ? '#3182ce' : '#2d3748',
                      fontWeight: isToday ? 'bold' : 'normal', fontSize: '14px', marginBottom: '4px'
                    }}>{day}</div>
                    {dayEvents.map((ev, j) => (
                      <div key={j} style={{
                        fontSize: '11px', padding: '2px 4px', borderRadius: '3px', marginBottom: '2px',
                        background: ev.type === 'holiday' ? '#fed7d7' : '#bee3f8',
                        color: ev.type === 'holiday' ? '#c53030' : '#2b6cb0',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>{ev.name || ev.title}</div>
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 일정 추가 팝업 */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '12px', padding: '32px', width: '320px'
          }}>
            <h3 style={{ marginTop: 0, color: '#1e3a5f' }}>일정 추가</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>날짜</label>
              <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>일정 이름</label>
              <input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="예: 중간고사, 실험 마감"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', background: 'white' }}>취소</button>
              <button onClick={() => {
                if (!newEvent.date || !newEvent.title.trim()) { alert('날짜와 이름을 입력하세요'); return }
                setEvents(prev => [...prev, newEvent])
                setNewEvent({ date: '', title: '' })
                setShowForm(false)
              }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: '#1e3a5f', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Calendar