import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'

const HOLIDAYS = [
  { date: '2025-03-01', name: '?ºÏùº?? },
  { date: '2025-05-05', name: '?¥Î¶∞?¥ÎÇ†' },
  { date: '2025-06-06', name: '?ÑÏ∂©?? },
  { date: '2025-08-15', name: 'Í¥ëÎ≥µ?? },
  { date: '2025-10-03', name: 'Í∞úÏ≤ú?? },
  { date: '2025-10-09', name: '?úÍ??? },
  { date: '2026-01-01', name: '?†Ï†ï' },
  { date: '2026-03-01', name: '?ºÏùº?? },
  { date: '2026-05-05', name: '?¥Î¶∞?¥ÎÇ†' },
]

const EVENT_TYPES = [
  { value: 'academic', label: '?ôÏÇ¨?ºÏ†ï', color: '#3B5BDB', bg: '#EDF2FF' },
  { value: 'lab',      label: '?∞Íµ¨??,   color: '#2F9E44', bg: '#EBFBEE' },
  { value: 'etc',      label: 'Í∏∞Ì?',     color: '#E8A020', bg: '#FFF9DB' },
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
    if (!newEvent.date || !newEvent.title.trim()) { alert('?†Ïßú?Ä ?úÎ™©???ÖÎ†•?òÏÑ∏??); return }
    await supabase.from('calendar_events').insert({ date: newEvent.date, title: newEvent.title, type: newEvent.type })
    setNewEvent({ date: '', title: '', type: 'academic' })
    setShowForm(false)
    fetchEvents()
  }

  async function deleteEvent(id, e) {
    e.stopPropagation()
    if (!window.confirm('??†ú?òÏãúÍ≤†Ïäµ?àÍπå?')) return
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
      ? { color: '#C62828', bg: '#FFEBEE', label: 'Í≥µÌú¥?? }
      : EVENT_TYPES.find(t => t.value === type) || { color: C.muted, bg: C.bg, label: type }

  return (
    <div>
      <PageBanner title="?¨Î†•" sub="Calendar" breadcrumb={['??, '?¨Î†•']} />

      <div style={{ padding: '28px 40px' }}>
        {/* ?§Îçî Ïª®Ìä∏Î°?*/}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={prevMonth} style={{
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>?Ä</button>
            <span style={{ fontSize: '20px', fontWeight: '800', color: C.navy, minWidth: '120px', textAlign: 'center' }}>
              {year}??{month + 1}??
            </span>
            <button onClick={nextMonth} style={{
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
            }}>??/button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} style={{
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px',
              padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: C.muted,
            }}>?§Îäò</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Î≤îÎ? */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {[{ color: '#C62828', label: 'Í≥µÌú¥?? }, ...EVENT_TYPES].map(t => (
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
              }}>+ ?ºÏ†ï Ï∂îÍ?</button>
            )}
          </div>
        </div>

        {/* Ï∫òÎ¶∞??*/}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
          {/* ?îÏùº ?§Îçî */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: C.navy }}>
            {['??, '??, '??, '??, 'Î™?, 'Í∏?, '??].map((d, i) => (
              <div key={d} style={{ padding: '12px', textAlign: 'center', fontWeight: '700', fontSize: '13px',
                color: i === 0 ? '#FF8A80' : i === 6 ? '#82B1FF' : 'rgba(255,255,255,0.9)' }}>{d}</div>
            ))}
          </div>

          {/* ?†Ïßú ?Ä */}
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
                        <div style={{ fontSize: '10px', color: C.muted }}>+{entries.length - 2}Í∞?/div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ?†ÌÉù?????ÅÏÑ∏ */}
        {selectedDay && (
          <div style={{
            marginTop: '16px', background: C.white, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: C.navy }}>
                {month + 1}??{selectedDay}???ºÏ†ï
              </div>
              {isAdmin && (
                <button onClick={() => { setNewEvent({ ...newEvent, date: dateStr(selectedDay) }); setShowForm(true) }}
                  style={{ background: C.navy, color: C.white, border: 'none', padding: '5px 14px',
                    borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                  + Ï∂îÍ?
                </button>
              )}
            </div>
            {getEntries(selectedDay).length === 0
              ? <p style={{ color: C.muted, margin: 0, fontSize: '13px' }}>?ºÏ†ï???ÜÏäµ?àÎã§.</p>
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
                      }}>??/button>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* ?ºÏ†ï Ï∂îÍ? Î™®Îã¨ */}
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
            <h3 style={{ marginTop: 0, color: C.navy, fontSize: '16px', fontWeight: '800' }}>?ºÏ†ï Ï∂îÍ?</h3>
            {[
              { label: '?†Ïßú *', el: <input type="date" value={newEvent.date}
                  onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px',
                    border: `1px solid ${C.border}`, boxSizing: 'border-box', fontSize: '14px' }} /> },
              { label: 'Ï¢ÖÎ•ò', el: <select value={newEvent.type}
                  onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px',
                    border: `1px solid ${C.border}`, fontSize: '14px' }}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select> },
              { label: '?ºÏ†ï ?¥Î¶Ñ *', el: <input value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="?? Ï§ëÍ∞ÑÍ≥†ÏÇ¨, ?§Ìóò ÎßàÍ∞ê"
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
              }}>Ï∑®ÏÜå</button>
              <button onClick={addEvent} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: C.navy, color: C.white, cursor: 'pointer', fontWeight: '700', fontSize: '13px',
              }}>Ï∂îÍ?</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
