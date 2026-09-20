import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { C, PageBanner, Card, btnPrimary, btnGhost } from '../design'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useInventorySession } from '../hooks/useInventorySession'
import StartSessionModal from '../components/inventory/StartSessionModal'
import SessionHistoryTable from '../components/inventory/SessionHistoryTable'
import SessionReviewModal from '../components/inventory/SessionReviewModal'
import InventoryCountView from '../components/inventory/InventoryCountView'

export default function Inventory() {
  const { isAdmin, student } = useOutletContext?.() || {}
  const myName = student?.name || ''
  const [view, setView] = useState('main')
  const { isMobile } = useBreakpoint()

  const {
    sessions, activeSession, locations,
    startForm, setStartForm, zoneMode, setZoneMode, showStartModal, setShowStartModal,
    reviewSession, setReviewSession,
    progress, myCountedCount, busy, rooms,
    zoneTokenOf, fetchProgress,
    startSession, pauseSession, resumeSession, cancelSession,
    completeSession, reopenSession, finalizeSession,
  } = useInventorySession(student)

  // 다른 페이지에 갔다가 재고실사로 돌아와도 "실사 입력" 화면에 있던 걸 유지 —
  // Inventory 컴포넌트가 라우트 이동으로 언마운트되면서 view 상태가 사라지는 문제 보정.
  const restoredViewRef = useRef(false)
  useEffect(() => {
    if (restoredViewRef.current || !activeSession || !student || activeSession.status !== 'active') return
    let saved
    try { saved = JSON.parse(sessionStorage.getItem('inv_count_view') || 'null') } catch { saved = null }
    if (!saved || saved.sessionId !== activeSession.id) return
    restoredViewRef.current = true
    setView('count')
  }, [activeSession, student])

  function enterCounting() {
    if (!student) { alert('로그인 후 이용해주세요'); return }
    setView('count')
    sessionStorage.setItem('inv_count_view', JSON.stringify({ sessionId: activeSession.id }))
  }

  const progressPct = progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0

  if (view === 'count') return (
    <InventoryCountView
      session={activeSession}
      myName={myName}
      student={student}
      isAdmin={isAdmin}
      onBack={() => { setView('main'); fetchProgress(); sessionStorage.removeItem('inv_count_view') }}
    />
  )

  // 모바일: 세션 생성/일시중단/취소/완료처리/최종반영 같은 관리 기능은 PC 전용으로 남기고
  // "지금 진행 중인 실사에 들어가서 입력을 이어간다"는 동작 하나만 노출한다.
  if (isMobile) return (
    <div>
      <PageBanner title="재고 실사" sub="Inventory Count" breadcrumb={['홈', '재고 실사']} />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!activeSession && (
          <Card title="📋 진행 중인 실사 없음">
            <p style={{ color: C.muted, fontSize: '14px', margin: 0 }}>
              진행 중인 실사가 없습니다. 실사 시작은 PC에서 해주세요.
            </p>
          </Card>
        )}

        {activeSession && (
          <Card
            title={`📊 ${activeSession.year}년 재고 실사${activeSession.label ? ` · ${activeSession.label}` : ''}`}
            sub={activeSession.purpose === 'full_census' ? '전수조사' : '현재목록 재고실사'}
          >
            {activeSession.status === 'paused' ? (
              <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#E65100' }}>
                <strong>⏸ 실사가 임시저장 상태로 중단되었습니다.</strong>
                <div style={{ marginTop: '2px', fontSize: '12px', color: '#BF5700' }}>관리자가 재개할 때까지 입력이 제한됩니다.</div>
              </div>
            ) : activeSession.status === 'reviewed' ? (
              <div style={{ background: '#E8F1FF', border: '1px solid #9DBEF0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#1F4E96' }}>
                <strong>🔎 관리자 검토 중입니다.</strong>
                <div style={{ marginTop: '2px', fontSize: '12px' }}>입력은 마감되었고, 관리자가 최종 반영하면 재고에 확정됩니다. 그때까지 시약목록엔 미확정 값(파란 배경)으로 보여요.</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                    <span style={{ color: C.muted }}>전체 진행률</span>
                    <span style={{ fontWeight: '700', color: C.navy }}>{progress.done} / {progress.total}개 완료 ({progressPct}%)</span>
                  </div>
                  <div style={{ height: '10px', background: C.bg, borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '5px', background: progressPct === 100 ? '#38A169' : C.navy, width: `${progressPct}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
                {student ? (
                  <button onClick={enterCounting} style={{ ...btnPrimary, width: '100%', padding: '14px', fontSize: '15px', minHeight: '44px' }}>
                    {myCountedCount > 0 ? '📝 실사 이어서 진행' : '📝 실사 입력 시작'}
                  </button>
                ) : (
                  <p style={{ fontSize: '13.5px', color: C.muted, textAlign: 'center', margin: 0 }}>로그인 후 이용해주세요</p>
                )}
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <PageBanner title="재고 실사" sub="Inventory Count" breadcrumb={['홈', '재고 실사']} />
      <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {!activeSession && (
          <Card title="📋 진행 중인 실사 없음">
            <p style={{ color: C.muted, fontSize: '14px', margin: '0 0 16px' }}>현재 진행 중인 실사가 없습니다.</p>
            {isAdmin && <button onClick={() => {
              const today = new Date().toISOString().slice(0, 10)
              setStartForm(f => ({ ...f, start_date: f.start_date || today, created_by: f.created_by || myName }))
              setShowStartModal(true)
            }} style={btnPrimary}>🚀 실사 시작</button>}
          </Card>
        )}

        {activeSession && (
          <>
            <Card
              title={`📊 ${activeSession.year}년 재고 실사${activeSession.label ? ` · ${activeSession.label}` : ''}`}
              sub={`시작일: ${activeSession.start_date} · 시작자: ${activeSession.created_by} · 범위: ${activeSession.zones?.length ? activeSession.zones.join(', ') : '전체'} · ${activeSession.purpose === 'full_census' ? '전수조사' : '현재목록 재고실사'}`}
              extra={isAdmin && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {activeSession.status === 'paused' && <button onClick={resumeSession} disabled={busy} style={{ ...btnPrimary, background: '#1565C0' }}>▶ 재개</button>}
                  {activeSession.status === 'active' && <button onClick={pauseSession} disabled={busy} style={{ ...btnGhost, color: '#E65100', borderColor: '#E65100', opacity: busy ? 0.6 : 1 }}>⏸ 일시중단</button>}
                  <button onClick={cancelSession} disabled={busy} style={{ ...btnGhost, color: C.danger, borderColor: C.danger }}>🗑️ 실사 취소</button>
                  {activeSession.status === 'active' && (
                    <button onClick={completeSession} disabled={busy} style={{ ...btnPrimary, background: '#1565C0', minWidth: '150px', textAlign: 'center' }}>✅ 실사 완료 처리</button>
                  )}
                  {activeSession.status === 'reviewed' && (
                    <>
                      <button onClick={reopenSession} disabled={busy} style={{ ...btnGhost, color: '#1565C0', borderColor: '#1565C0' }}>↩ 검토 취소(다시 열기)</button>
                      <button onClick={finalizeSession} disabled={busy} style={{ ...btnPrimary, background: '#38A169', minWidth: '150px', textAlign: 'center' }}>🏁 DB 최종 반영</button>
                    </>
                  )}
                </div>
              )}
            >
              {activeSession.status === 'paused' && (
                <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#E65100' }}>
                  <span style={{ fontSize: '16px' }}>⏸</span>
                  <div>
                    <strong>실사가 임시저장 상태로 중단되었습니다.</strong>
                    {activeSession.paused_at && (
                      <span style={{ color: '#BF5700', marginLeft: '8px', fontSize: '12px' }}>
                        {new Date(activeSession.paused_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 중단
                      </span>
                    )}
                    {!isAdmin && <div style={{ marginTop: '2px', fontSize: '12px', color: '#BF5700' }}>관리자가 재개할 때까지 입력이 제한됩니다. 기존 입력 내용은 유지됩니다.</div>}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ color: C.muted }}>전체 진행률</span>
                  <span style={{ fontWeight: '700', color: C.navy }}>{progress.done} / {progress.total}개 완료 ({progressPct}%)</span>
                </div>
                <div style={{ height: '10px', background: C.bg, borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '5px', background: progressPct === 100 ? '#38A169' : C.navy, width: `${progressPct}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
              {activeSession.status === 'reviewed' && (
                <div style={{ background: '#E8F1FF', border: '1px solid #9DBEF0', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#1F4E96' }}>
                  <strong>🔎 검토 단계</strong> — 학생 입력은 마감되었습니다. 시약목록에는 실사값이 <b>미확정(파란 배경)</b>으로 보이고,
                  실제 재고 장부는 {isAdmin ? '"DB 최종 반영"을 누르면' : '관리자가 최종 반영하면'} 바뀝니다.
                </div>
              )}
              {activeSession.status !== 'active' ? null : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {student ? (
                    <span style={{ fontSize: '13.5px', color: C.text }}>👤 {student.name}님으로 시작합니다</span>
                  ) : (
                    <span style={{ fontSize: '13.5px', color: C.muted }}>로그인 후 이용해주세요</span>
                  )}
                  <button onClick={enterCounting} style={btnPrimary}>{myCountedCount > 0 ? '📝 실사 이어서 진행' : '📝 실사 입력 시작'}</button>
                </div>
              )}
            </Card>
          </>
        )}

        <SessionHistoryTable sessions={sessions} isAdmin={isAdmin} onReview={setReviewSession} />
      </div>

      {showStartModal && (
        <StartSessionModal
          startForm={startForm} setStartForm={setStartForm}
          zoneMode={zoneMode} setZoneMode={setZoneMode}
          rooms={rooms} locations={locations} zoneTokenOf={zoneTokenOf}
          onStart={startSession} onClose={() => setShowStartModal(false)}
        />
      )}

      {reviewSession && <SessionReviewModal session={reviewSession} onClose={() => setReviewSession(null)} />}
    </div>
  )
}
