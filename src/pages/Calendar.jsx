import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'

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
  { value: 'academic', label: '학사일정', color: '#3B5BDB', bg: '#EDF2FF' },
  { value: 'lab',      label: '연구실',   color: '#2F9E44', bg: '#EBFBEE' },
  { value: 'etc',      label: '기타',     color: '#E8A020', bg: '#FFF9DB' },
]

export default function Calendar() {
  const { isAdmin } = useOutletContext?.() || {}
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState({ date: '', title: '', type: 'academic' })
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => { fetchEvents() }, [year, month])

  async function fetchEvents() {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const to = `${year}-${String(month + 1).padStart(2, '0')}-31`
    const { data } = await supabase.from('calendar_events')
      .select('*').gte('date', from).lte('date', to).order('date')
    if (data) setEvents(data)
  }

  async function addEvent() {
    if (!newEvent.date || !newEvent.title.trim()) { alert('날짜와 제목을 입력하세요'); return }
    await supabase.from('calendar_events').insert({ date: newEvent.date, title: newEvent.title, type: newEvent.type })
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

  const getEntries = (day) => {
    const ds = dateStr(day)
    const holidays = HOLIDAYS.filter(h => h.date === ds).map(h => ({ ...h, type: 'holiday', id: 'h_' + h.date }))
    return [...holidays, ...events.filter(e => e.date === ds)]
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const typeInfo = (type) =>
    type === 'holiday'
      ? { color: '#C62828', bg: '#FFEBEE', label: '공휴일' }
      : EVENT_TYPES.find(t => t.value === type) || { color: C.muted, bg: C.bg, label: type }

  return (
    <div>
      <PageBanner title="달력" sub="Calendar" breadcrumb={['홈', '달력']} />

      <div style={{ padding: '28px 40px' }}>
        {/* 헤더 컨트롤 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={prevMonth} style={{
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>◀</button>
            <span style={{ fontSize: '20px', fontWeight: '800', color: C.navy, minWidth: '120px', textAlign: 'center' }}>
              {year}년 {month + 1}월
            </span>
            <button onClick={nextMonth} style={{
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>▶</button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} style={{
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px',
              padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: C.muted,
            }}>오늘</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* 범례 */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {[{ color: '#C62828', label: '공휴일' }, ...EVENT_TYPES].map(t => (
                <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: t.color }} />
                  <span style={{ fontSize: '11px', color: C.muted }}>{t.label}</span>
                </div>
              ))}
            </div>
            {isAdmin && (
              <button onClick={() => setShowForm(true)} style={{
                background: C.navy, color: C.white, border: 'none',
                padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600',
              }}>+ 일정 추가</button>
            )}
          </div>
        </div>

        {/* 캘린더 */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: C.navy }}>
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} style={{ padding: '12px', textAlign: 'center', fontWeight: '700', fontSize: '13px',
                color: i === 0 ? '#FF8A80' : i === 6 ? '#82B1FF' : 'rgba(255,255,255,0.9)' }}>{d}</div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {cells.map((day, i) => {
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              const isSelected = day === selectedDay
              const entries = day ? getEntries(day) : []
              const isSun = i % 7 === 0, isSat = i % 7 === 6
              return (
                <div key={i} onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                  style={{
                    minHeight: '88px', padding: '8px', cursor: day ? 'pointer' : 'default',
                    borderRight: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border,
                    background: isSelected ? '#EEF2FB' : day ? C.white : C.bg,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (day && !isSelected) e.currentTarget.style.background = C.bg }}
                  onMouseLeave={e => { if (day && !isSelected) e.currentTarget.style.background = C.white }}
                >
                  {day && (
                    <>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px',
                        background: isToday ? C.navy : 'transparent',
                        color: isToday ? C.white : isSun ? '#C62828' : isSat ? '#1565C0' : C.text,
                        fontWeight: isToday ? '800' : '400', fontSize: '13px',
                      }}>{day}</div>
                      {entries.slice(0, 2).map((ev, j) => {
                        const ti = typeInfo(ev.type)
                        return (
                          <div key={j} style={{
                            fontSize: '10px', padding: '2px 5px', borderRadius: '3px', marginBottom: '2px',
                            background: ti.bg, color: ti.color, fontWeight: '600',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{ev.name || ev.title}</div>
                        )
                      })}
                      {entries.length > 2 && (
                        <div style={{ fontSize: '10px', color: C.muted }}>+{entries.length - 2}개</div>
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
          <div style={{
            marginTop: '16px', background: C.white, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: C.navy }}>
                {month + 1}월 {selectedDay}일 일정
              </div>
              {isAdmin && (
                <button onClick={() => { setNewEvent({ ...newEvent, date: dateStr(selectedDay) }); setShowForm(true) }}
                  style={{ background: C.navy, color: C.white, border: 'none', padding: '5px 14px',
                    borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                  + 추가
                </button>
              )}
            </div>
            {getEntries(selectedDay).length === 0
              ? <p style={{ color: C.muted, margin: 0, fontSize: '13px' }}>일정이 없습니다.</p>
              : getEntries(selectedDay).map(ev => {
                const ti = typeInfo(ev.type)
                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px', marginBottom: '6px',
                    background: ti.bg, borderRadius: '7px', borderLeft: `3px solid ${ti.color}`,
                  }}>
                    <span style={{ fontSize: '11px', color: ti.color, fontWeight: '700', minWidth: '48px' }}>
                      {ti.label}
                    </span>
                    <span style={{ flex: 1, fontSize: '13px', color: C.text, fontWeight: '600' }}>
                      {ev.name || ev.title}
                    </span>
                    {isAdmin && ev.type !== 'holiday' && (
                      <button onClick={(e) => deleteEvent(ev.id, e)} style={{
                        background: 'none', border: 'none', color: C.muted,
                        cursor: 'pointer', fontSize: '14px', padding: '0 4px',
                      }}>✕</button>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* 일정 추가 모달 */}
      {showForm && isAdmin && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.45)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px', width: '360px',
            boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <h3 style={{ marginTop: 0, color: C.navy, fontSize: '16px', fontWeight: '800' }}>일정 추가</h3>
            {[
              { label: '날짜 *', el: <input type="date" value={newEvent.date}
                  onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px',
                    border: `1px solid ${C.border}`, boxSizing: 'border-box', fontSize: '14px' }} /> },
              { label: '종류', el: <select value={newEvent.type}
                  onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px',
                    border: `1px solid ${C.border}`, fontSize: '14px' }}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select> },
              { label: '일정 이름 *', el: <input value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="예: 중간고사, 실험 마감"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px',
                    border: `1px solid ${C.border}`, boxSizing: 'border-box', fontSize: '14px' }} /> },
            ].map(({ label, el }) => (
              <div key={label} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px',
                  color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>{label}</label>
                {el}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowForm(false)} style={{
                flex: 1, padding: '10px', borderRadius: '6px',
                border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px',
              }}>취소</button>
              <button onClick={addEvent} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: C.navy, color: C.white, cursor: 'pointer', fontWeight: '700', fontSize: '13px',
              }}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
