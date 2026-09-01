import { C, inputStyle, labelStyle } from '../../design'
import CompanyPicker from '../CompanyPicker'

// 신규 시약 등록 모달 — "신규 시약 등록"/"직접 제조 시약 등록" 두 탭을 하나의 모달에서 전환.
// 로그인이 안 되어 있으면 같은 모달 안에서 인라인 로그인 확인 → 성공 시 원래 등록을 이어서 제출.
// 실제 등록/로그인 처리 로직(submitNewReagent/submitMade/submitInlineLogin)은 student/session
// 등 페이지 전역 상태를 다루므로 부모(ReagentList)에 그대로 두고, 여기는 폼 UI만 담당한다.
export default function RegisterReagentModal({
  registerTab, setRegisterTab,
  newReagentForm, setNewReagentForm,
  madeForm, setMadeForm,
  locations,
  showInlineLogin, inlineLoginForm, setInlineLoginForm, inlineLoginError, setInlineLoginError,
  inlineLoginLoading, setPendingRegisterTab, setShowInlineLogin,
  dupCandidates, onSearchDuplicates, onPickDuplicate, onClearDuplicate,
  onSubmitInlineLogin, onSubmitNewReagent, onSubmitMade, onClose,
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(26,42,94,0.55)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: '14px', padding: '24px 28px 28px',
        width: '440px', maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
      }}>
        {showInlineLogin ? (
          <>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>🔑 로그인 확인</h3>
            <p style={{ margin: '0 0 18px', color: C.muted, fontSize: '12px' }}>
              등록하려면 먼저 로그인 정보를 확인해야 해요. 학번·생년월일·이름을 입력하면
              일치하는 즉시 로그인과 등록이 함께 처리됩니다.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>학번</label>
                <input value={inlineLoginForm.student_id}
                  onChange={e => { setInlineLoginForm({ ...inlineLoginForm, student_id: e.target.value }); setInlineLoginError('') }}
                  placeholder="예) 202112345" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>생년월일</label>
                <input value={inlineLoginForm.birth_date}
                  onChange={e => { setInlineLoginForm({ ...inlineLoginForm, birth_date: e.target.value }); setInlineLoginError('') }}
                  placeholder="YYYY-MM-DD" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>이름</label>
                <input value={inlineLoginForm.name}
                  onChange={e => { setInlineLoginForm({ ...inlineLoginForm, name: e.target.value }); setInlineLoginError('') }}
                  placeholder="예) 이OO" style={inputStyle} />
              </div>
              {inlineLoginError && (
                <div style={{ fontSize: '11.5px', color: C.dangerDark, background: C.dangerTint, padding: '8px 10px', borderRadius: '8px' }}>{inlineLoginError}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => { setShowInlineLogin(false); setPendingRegisterTab(null); setInlineLoginError('') }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={onSubmitInlineLogin} disabled={inlineLoginLoading} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px', opacity: inlineLoginLoading ? 0.6 : 1 }}>
                {inlineLoginLoading ? '확인 중...' : '확인하고 등록하기'}
              </button>
            </div>
          </>
        ) : (
          <>
        <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${C.border}`, marginBottom: '18px' }}>
          {[['new', '신규 시약 등록'], ['made', '직접 제조 시약 등록']].map(([key, label]) => (
            <button key={key} onClick={() => setRegisterTab(key)} style={{
              padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13.5px', fontFamily: 'inherit', fontWeight: registerTab === key ? 700 : 500,
              color: registerTab === key ? C.blueDark : C.muted,
              borderBottom: registerTab === key ? `2px solid ${C.blue}` : '2px solid transparent',
              marginBottom: '-1px', whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>

        {registerTab === 'new' ? (
          <>
            <p style={{ margin: '0 0 18px', color: C.muted, fontSize: '12px' }}>구매해서 새로 들여온 시약을 등록해요. 등록 즉시 목록에 반영되고, 관리자가 최종 확인하기 전까지는 "검토대기"로 표시돼요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>시약명 *</label>
                <input value={newReagentForm.name}
                  onChange={e => setNewReagentForm({ ...newReagentForm, name: e.target.value, reagent_id: null })}
                  onBlur={onSearchDuplicates} placeholder="예) Acetone" style={inputStyle} />
                {dupCandidates?.length > 0 && (
                  <div style={{ marginTop: '8px', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '6px 10px', fontSize: '11px', color: '#92400E', background: '#FFF8E7' }}>
                      이미 등록된 시약이 있어요 — 같은 제품이면 골라서 새 Lot(병)만 추가하세요.
                    </div>
                    {dupCandidates.map(c => (
                      <div key={c.id} onClick={() => onPickDuplicate(c)}
                        style={{ padding: '8px 10px', cursor: 'pointer', borderTop: `1px solid ${C.border}`, fontSize: '12.5px' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = C.white}>
                        <div style={{ fontWeight: '600', color: C.navy }}>{c.name}</div>
                        <div style={{ color: C.muted, fontSize: '11.5px', marginTop: '2px' }}>
                          {[c.company, c.cas_no, c.volume ? `${c.volume}${c.unit || ''}` : null, c.category].filter(Boolean).join(' · ') || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {newReagentForm.reagent_id && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', padding: '8px 10px' }}>
                    <span style={{ fontSize: '12px', color: '#276749' }}>✓ 기존 시약에 새 Lot만 추가돼요(기본 정보는 그대로 씀)</span>
                    <button type="button" onClick={onClearDuplicate}
                      style={{ background: 'none', border: 'none', color: '#276749', textDecoration: 'underline', cursor: 'pointer', fontSize: '11.5px', flexShrink: 0, marginLeft: '8px' }}>
                      다른 시약이에요
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>CAS No.</label>
                  <input value={newReagentForm.cas_no} disabled={!!newReagentForm.reagent_id} onChange={e => setNewReagentForm({ ...newReagentForm, cas_no: e.target.value })}
                    style={{ ...inputStyle, background: newReagentForm.reagent_id ? C.bg : C.white }} />
                </div>
                <div>
                  <label style={labelStyle}>제조사</label>
                  <CompanyPicker value={newReagentForm.company} disabled={!!newReagentForm.reagent_id} onChange={v => setNewReagentForm({ ...newReagentForm, company: v })}
                    style={{ background: newReagentForm.reagent_id ? C.bg : C.white }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>성상</label>
                  <input value={newReagentForm.category} disabled={!!newReagentForm.reagent_id} onChange={e => setNewReagentForm({ ...newReagentForm, category: e.target.value })} placeholder="액체/고체"
                    style={{ ...inputStyle, background: newReagentForm.reagent_id ? C.bg : C.white }} />
                </div>
                <div>
                  <label style={labelStyle}>용량</label>
                  <input value={newReagentForm.volume} disabled={!!newReagentForm.reagent_id} onChange={e => setNewReagentForm({ ...newReagentForm, volume: e.target.value })} placeholder="500"
                    style={{ ...inputStyle, background: newReagentForm.reagent_id ? C.bg : C.white }} />
                </div>
                <div>
                  <label style={labelStyle}>단위</label>
                  <input value={newReagentForm.unit} disabled={!!newReagentForm.reagent_id} onChange={e => setNewReagentForm({ ...newReagentForm, unit: e.target.value })} placeholder="mL"
                    style={{ ...inputStyle, background: newReagentForm.reagent_id ? C.bg : C.white }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>Cat No.</label>
                  <input value={newReagentForm.cat_no} onChange={e => setNewReagentForm({ ...newReagentForm, cat_no: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Lot No.</label>
                  <input value={newReagentForm.lot_no} onChange={e => setNewReagentForm({ ...newReagentForm, lot_no: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>보관 위치 *</label>
                <select value={newReagentForm.location_id} onChange={e => setNewReagentForm({ ...newReagentForm, location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>미개봉 수량</label>
                  <input type="number" min="0" value={newReagentForm.sealed_count} onChange={e => setNewReagentForm({ ...newReagentForm, sealed_count: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>잔량(%)</label>
                  <input type="number" min="0" max="100" value={newReagentForm.current_stock} onChange={e => setNewReagentForm({ ...newReagentForm, current_stock: e.target.value })} style={inputStyle} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={() => onSubmitNewReagent()} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>등록하기</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '-8px', marginBottom: '4px' }}>
              <span style={{ background: '#EAF1FB', color: '#1F4E96', fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px' }}>직접제조</span>
            </div>
            <p style={{ margin: '0 0 18px', color: C.muted, fontSize: '12px' }}>구매 시약과 달리 CAS·회사 정보가 없어요. 필요한 정보만 입력하세요. 등록 즉시 목록에 반영되고, 관리자가 최종 확인하기 전까지는 "검토대기"로 표시돼요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>제조한 시약명 *</label>
                <input value={madeForm.name} onChange={e => setMadeForm({ ...madeForm, name: e.target.value })} placeholder="예) pH 7.0 인산완충용액" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>용량</label>
                  <input value={madeForm.volume} onChange={e => setMadeForm({ ...madeForm, volume: e.target.value })} placeholder="예: 500" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>단위</label>
                  <input value={madeForm.unit} onChange={e => setMadeForm({ ...madeForm, unit: e.target.value })} placeholder="mL" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>제조일</label>
                <input type="date" value={madeForm.made_date} onChange={e => setMadeForm({ ...madeForm, made_date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>용도</label>
                <input value={madeForm.made_purpose} onChange={e => setMadeForm({ ...madeForm, made_purpose: e.target.value })} placeholder="예: 분광광도계 실험용 완충용액" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>보관 위치 *</label>
                <select value={madeForm.location_id} onChange={e => setMadeForm({ ...madeForm, location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={() => onSubmitMade()} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>등록하기</button>
            </div>
          </>
        )}
          </>
        )}
      </div>
    </div>
  )
}
