import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { C, Card, btnPrimary, btnExcel, inputStyle } from '../../design'
import { fetchAllPages } from '../../lib/fetchAllPages'
import { downloadInventorySnapshotExport, downloadInventorySnapshotBackup } from '../../lib/inventorySnapshotExcel'
import {
  parseInventorySnapshotAoa, runGlobalValidation, buildMatchIndexes, matchInventorySnapshotRows,
  computeExcludedLots, computeArchivedReagentsPreview, computeBaselineActiveLotIds,
  buildInventorySnapshotPayload, checkSyncReadiness,
  rowBucket, STRONG_CONFIRM_TEXT, GUIDE_SHEET_NAME,
} from '../../lib/inventorySnapshotMatch'
import { applyInventorySnapshotSync } from '../../lib/inventorySnapshotApply'
import { isAuthedAdmin, getAdminAuthUser, signInAdmin, signOutAdmin } from '../../lib/adminAuth'
import InventorySnapshotReviewPanel from './InventorySnapshotReviewPanel'
import InventorySnapshotPreviewTable from './InventorySnapshotPreviewTable'
import InventorySnapshotResultSummary from './InventorySnapshotResultSummary'

// ══════════════════════════════════════════════════════════════
//  현재 재고 Excel 동기화 (Phase 4b-2 미리보기 + Phase 4b-3a RPC 연동 준비)
//
//  "Excel 일괄 추가"(append-only, 신규만)와는 완전히 다른 기능이다 — 이건 현재 보유 재고
//  전체를 Excel 기준으로 맞추는 current inventory snapshot synchronization.
//
//  Phase 4b-3a 시점 상태: RPC 호출 코드(applyInventorySnapshotSync)는 완성돼 있지만,
//  이 RPC를 만드는 migration(20260913...inventory_snapshot_sync.sql)이 아직 운영 DB에
//  적용되지 않았고, 실제 적용 버튼도 항상 disabled다 — 그래서 실행하면 반드시 실패한다.
//  4b-3b에서 migration을 검토·적용한 뒤 disabled guard만 제거하면 그대로 동작하는 구조.
// ══════════════════════════════════════════════════════════════

const STEPS = [
  { n: 1, label: '현재 재고 파일 준비' },
  { n: 2, label: 'Excel 업로드 및 검증' },
  { n: 3, label: '매칭 확인' },
  { n: 4, label: '변경사항 미리보기' },
  { n: 5, label: '백업 및 적용 준비' },
]

async function fetchMatchBaseData() {
  // 매칭에 필요한 최소 컬럼만, 업로드 1회당 딱 한 번만 조회한다(§14).
  // updated_at은 화면에 쓰지 않지만 Phase 4b-3a의 stale-preview 방어(RPC의 optimistic lock)에
  // 필요해 payload에 그대로 실어 보낸다 — 여기서 미리 받아두지 않으면 적용 시점에 다시 조회해야 한다.
  const [reagents, lots, { data: locations }] = await Promise.all([
    fetchAllPages((from, to) => supabase.from('reagents')
      .select('id, name, name_ko, cas_no, company, purity, volume, unit, status, updated_at')
      .neq('status', 'archived').range(from, to)),
    fetchAllPages((from, to) => supabase.from('reagent_lots')
      .select('id, reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock, location_id, shelf_position, received_date, expiry_date, status, updated_at')
      .eq('status', 'active').range(from, to)),
    supabase.from('locations').select('id, room, detail'),
  ])
  return { reagents, lots, locations: locations || [] }
}

function StepHeader({ step }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 18, flexWrap: 'wrap' }}>
      {STEPS.map(s => (
        <div key={s.n} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
          background: s.n === step ? C.navy : s.n < step ? '#EAF1FB' : '#F3F4F6',
          color: s.n === step ? '#fff' : s.n < step ? C.navy : C.muted,
          fontSize: 12, fontWeight: s.n === step ? 700 : 500,
        }}>
          <span>{s.n < step ? '✓' : s.n}</span><span>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function InventorySnapshotSyncTab() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [error, setError] = useState('')

  const [fileName, setFileName] = useState('')
  const [normalizedRows, setNormalizedRows] = useState(null)
  const [baseData, setBaseData] = useState(null) // { reagents, lots, locations }
  const [idx, setIdx] = useState(null)
  const [reviewChoices, setReviewChoices] = useState({})
  const [confirmText, setConfirmText] = useState('')
  const [snapshotId] = useState(() => (globalThis.crypto?.randomUUID?.() || String(Date.now())))

  // 실제 적용에 필요한 Supabase Auth 관리자 세션(자료 CMS와 동일한 admin_users/is_admin()
  // 구조 재사용 — 별도 Auth 구현 없음). 이 세션이 있어도 STEP 5의 적용 버튼은 여전히
  // disabled다(§26) — 로그인 상태 자체를 4b-3a에서 미리 확인해두는 목적.
  const [adminAuth, setAdminAuth] = useState({ ready: false, authed: false, email: null })
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [applyBusy, setApplyBusy] = useState(false)
  const [applyResult, setApplyResult] = useState(null)

  useEffect(() => {
    ;(async () => {
      const ok = await isAuthedAdmin()
      const u = ok ? await getAdminAuthUser() : null
      setAdminAuth({ ready: true, authed: ok, email: u?.email || null })
    })()
  }, [])

  async function submitAdminLogin(e) {
    e.preventDefault()
    setAuthBusy(true); setAuthError('')
    const r = await signInAdmin(authForm.email, authForm.password)
    setAuthBusy(false)
    if (!r.ok) { setAuthError(r.error); return }
    setAuthForm({ email: '', password: '' })
    setAdminAuth({ ready: true, authed: true, email: r.user?.email || null })
  }
  async function handleAdminLogout() {
    await signOutAdmin()
    setAdminAuth(a => ({ ...a, authed: false, email: null }))
  }

  const matchedRows = useMemo(
    () => (idx && normalizedRows) ? matchInventorySnapshotRows(normalizedRows, idx, reviewChoices) : [],
    [idx, normalizedRows, reviewChoices],
  )
  const readiness = useMemo(() => checkSyncReadiness(matchedRows), [matchedRows])
  const excludedLots = useMemo(
    () => (idx && baseData) ? computeExcludedLots(baseData.lots, matchedRows) : [],
    [idx, baseData, matchedRows],
  )
  const archivedReagentsPreview = useMemo(
    () => (idx && baseData) ? computeArchivedReagentsPreview(baseData.reagents, idx.lotsByReagent, matchedRows) : [],
    [idx, baseData, matchedRows],
  )
  const reviewRows = useMemo(() => matchedRows.filter(r => rowBucket(r) === 'review'), [matchedRows])
  // baseline_active_lot_ids — 미리보기(=이 데이터를 불러온 시점)의 active Lot 전체.
  // RPC가 이 목록과 실행 시점 DB 상태를 대조해 그 사이 재고가 바뀌었으면 통째로 중단한다.
  const baselineActiveLotIds = useMemo(
    () => baseData ? computeBaselineActiveLotIds(baseData.lots) : [],
    [baseData],
  )
  const payload = useMemo(
    () => buildInventorySnapshotPayload(matchedRows, { snapshotId, sourceFilename: fileName, baselineActiveLotIds }),
    [matchedRows, snapshotId, fileName, baselineActiveLotIds],
  )

  const summary = useMemo(() => {
    const c = { total: matchedRows.length, changed: 0, unchanged: 0, new: 0, review: 0, error: 0 }
    for (const r of matchedRows) c[rowBucket(r)]++
    return c
  }, [matchedRows])

  async function handleDownloadExport() {
    setBusy(true); setBusyMsg('현재 재고를 불러오는 중...'); setError('')
    try {
      const n = await downloadInventorySnapshotExport()
      setBusyMsg('')
      alert(`현재 활성 재고 ${n.toLocaleString()}건을 내려받았어요.`)
    } catch (e) {
      setError('Excel 다운로드 실패: ' + e.message)
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }

  async function handleFile(file) {
    if (!file) return
    setError('')
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) { setError('.xlsx 또는 .xls 파일만 업로드할 수 있어요.'); return }
    setBusy(true); setBusyMsg('파일을 분석하는 중...'); setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      let wb
      try {
        wb = XLSX.read(buf, { type: 'array', cellDates: true })
      } catch {
        throw new Error('엑셀 파일을 열지 못했어요. 파일이 손상되지 않았는지 확인해주세요.')
      }
      if (!wb.SheetNames || wb.SheetNames.length === 0) throw new Error('워크북에 시트가 없어요.')

      const getSheetAoa = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
      const parsed = parseInventorySnapshotAoa(wb.SheetNames, getSheetAoa)
      if (parsed.fileError) { setError(parsed.fileError); setNormalizedRows(null); return }

      runGlobalValidation(parsed.rows)

      setBusyMsg('기존 시약·재고 정보를 불러오는 중...')
      const base = await fetchMatchBaseData()
      const indexes = buildMatchIndexes(base)

      setBaseData(base)
      setIdx(indexes)
      setNormalizedRows(parsed.rows)
      setReviewChoices({})
      setConfirmText('')
      setStep(3)
    } catch (e) {
      setError(e.message || '파일 처리 중 오류가 발생했어요.')
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }

  function resolveReview(rowNo, patch) {
    setReviewChoices(prev => ({ ...prev, [rowNo]: { ...prev[rowNo], ...patch } }))
  }

  // 실제 적용 handler — 코드는 완성돼 있지만 아래 버튼이 항상 disabled라 지금은 호출될 수
  // 없다(§26/§46). 4b-3b에서 migration 적용 후 버튼의 disabled guard만 제거하면 그대로 쓴다.
  // 실패해도 선택한 파일/REVIEW 결정/미리보기 state를 초기화하지 않는다(§35) — 사용자가
  // 오류를 확인하고 그대로 재시도하거나 Excel을 고쳐 다시 업로드할 수 있어야 한다.
  async function handleApplySync() {
    if (!adminAuth.authed) { setError('실제 적용에는 Supabase Auth 관리자 로그인이 필요합니다.'); return }
    if (!readiness.ready) { setError('오류 또는 확인 필요 항목이 남아 있어 적용할 수 없습니다.'); return }
    if (confirmText.trim() !== STRONG_CONFIRM_TEXT) { setError(`"${STRONG_CONFIRM_TEXT}"를 정확히 입력해주세요.`); return }
    setApplyBusy(true); setError(''); setApplyResult(null)
    try {
      const result = await applyInventorySnapshotSync(payload)
      setApplyResult(result)
    } catch (e) {
      // stale preview(§7~9)·중복 실행(§24)·동시 실행(§6) 등 RPC의 한국어 예외 메시지를 그대로 노출.
      setError(e.message)
    } finally {
      setApplyBusy(false)
    }
  }

  async function handleDownloadBackup() {
    setBusy(true); setBusyMsg('현재 DB 상태로 백업 파일을 만드는 중...'); setError('')
    try {
      const n = await downloadInventorySnapshotBackup()
      setBusyMsg('')
      alert(`백업 파일에 현재 활성 재고 ${n.toLocaleString()}건을 담았어요.`)
    } catch (e) {
      setError('백업 다운로드 실패: ' + e.message)
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }

  const canGoStep3 = !!normalizedRows
  const canGoStep4 = canGoStep3
  const canGoStep5 = canGoStep4
  const strongConfirmOk = confirmText.trim() === STRONG_CONFIRM_TEXT

  return (
    <Card title="🔁 현재 재고 동기화" sub="Inventory Snapshot Sync — Excel 일괄 추가(신규 추가 전용)와는 다른 기능입니다">
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7, marginBottom: 18 }}>
        연 1회 재고 정리 등에서 Excel 기준으로 <b>현재 보유 재고 전체</b>를 일괄 확인·동기화합니다.
        <br />신규 시약만 추가하는 기능이 아닙니다 — 기존 시약/Lot은 최대한 그대로 유지하며 위치·잔량만 갱신하고,
        Excel에서 빠진 재고는 삭제하지 않고 "현재 목록 제외" 예정으로만 표시합니다.
        <br /><b>실제 적용 버튼은 아직 비활성화돼 있습니다.</b> DB에 반영하는 RPC 자체는 만들어졌지만, 그 RPC를 만드는 DB 변경이
        운영에 적용되기 전까지는 이 화면에서 아무것도 저장되지 않습니다.
      </div>

      <StepHeader step={step} />

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8, color: C.dangerDark, fontSize: 12.5 }}>{error}</div>
      )}
      {busy && <div style={{ marginBottom: 16, fontSize: 12.5, color: C.muted }}>{busyMsg || '처리 중...'}</div>}

      {/* STEP 1 */}
      {step === 1 && (
        <div>
          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
            먼저 현재 DB의 활성 재고를 기준으로 동기화용 Excel을 내려받으세요. 이 파일에는 위치·잔량을 정리할 수 있는
            칸과 함께, 시스템이 각 행을 정확히 알아보기 위한 <code>__reagent_id</code>/<code>__lot_id</code> 칸이 포함돼 있습니다
            ("{GUIDE_SHEET_NAME}" 시트에 사용법이 있어요). 이 칸은 지우거나 수정하지 마세요 — 새 시약/병을 추가할 때만 비워두면 됩니다.
          </p>
          <button onClick={handleDownloadExport} disabled={busy} style={{ ...btnExcel, opacity: busy ? 0.6 : 1 }}>
            📊 현재 재고 동기화용 Excel 다운로드
          </button>
          <div style={{ marginTop: 18 }}>
            <button onClick={() => setStep(2)} style={btnPrimary}>다음: Excel 업로드 →</button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
            정리한 Excel 파일을 업로드하세요. STEP 1에서 받은 양식 그대로여야 합니다(시트 구조·헤더 변경 시 인식하지 못할 수 있어요).
          </p>
          <label style={{ ...btnPrimary, cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
            📁 엑셀 파일 선택
            <input type="file" accept=".xlsx,.xls" disabled={busy} style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])} />
          </label>
          {fileName && <span style={{ marginLeft: 10, fontSize: 12.5, color: C.text }}>· {fileName}</span>}
          <div style={{ marginTop: 18 }}>
            <button onClick={() => setStep(1)} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}` }}>← 이전</button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && normalizedRows && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['총 Excel 행', summary.total, C.text],
              ['변경 있음', summary.changed, '#8A5A16'],
              ['변경 없음', summary.unchanged, C.muted],
              ['신규', summary.new, '#1F4E96'],
              ['확인 필요', summary.review, '#8A5A16'],
              ['오류', summary.error, C.danger],
              ['현재 목록 제외 예정(잠정)', excludedLots.length, '#8A5A16'],
              ['시약 마스터 보관 처리 예정(잠정)', archivedReagentsPreview.length, C.muted],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', minWidth: 130 }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{val.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 8 }}>확인 필요 {reviewRows.length}건</div>
          <InventorySnapshotReviewPanel rows={reviewRows} idx={idx} onResolve={resolveReview} />

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={() => setStep(2)} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}` }}>← 이전</button>
            <button onClick={() => setStep(4)} disabled={!canGoStep4} style={btnPrimary}>다음: 변경사항 미리보기 →</button>
          </div>
        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && idx && (
        <div>
          <InventorySnapshotPreviewTable
            matchedRows={matchedRows} idx={idx} excludedLots={excludedLots}
            provisionalExcluded={reviewRows.length > 0}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={() => setStep(3)} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}` }}>← 이전</button>
            <button onClick={() => setStep(5)} disabled={!canGoStep5} style={btnPrimary}>다음: 백업 및 적용 준비 →</button>
          </div>
        </div>
      )}

      {/* STEP 5 */}
      {step === 5 && (
        <div>
          {applyResult ? (
            <InventorySnapshotResultSummary
              result={applyResult}
              onGoReagentList={() => navigate('/reagents/list')}
            />
          ) : (
          <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: readiness.ready ? '#E7F5EC' : '#FDECEC', color: readiness.ready ? '#1E7A46' : C.dangerDark }}>
              {readiness.ready ? '✓ 적용 준비 조건 충족' : `⚠ 오류 ${readiness.blockingErrors}건 · 확인 필요 ${readiness.unresolvedReview}건 남음`}
            </span>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>1) 적용 전 현재 재고 백업 다운로드</div>
            <p style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>
              지금 업로드한 파일이 아니라, <b>지금 이 순간의 DB 상태</b>를 새로 내려받습니다. 되돌릴 때 참고할 수 있어요.
            </p>
            <button onClick={handleDownloadBackup} disabled={busy} style={{ ...btnExcel, opacity: busy ? 0.6 : 1 }}>💾 적용 전 현재 재고 백업 다운로드</button>
          </div>

          <div style={{ marginBottom: 20, padding: '14px 16px', background: '#F7F9FC', border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 8 }}>2) 관리자 인증(실제 적용에만 필요)</div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              자료 탭 공식자료 관리와 동일한 Supabase Auth 관리자 로그인입니다. 이 앱의 일반 로그인과는 별개이며,
              로그인해도 미리보기 단계(STEP 1~4)에는 영향이 없습니다.
            </p>
            {!adminAuth.ready ? (
              <div style={{ fontSize: 12, color: C.muted }}>확인 중...</div>
            ) : adminAuth.authed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: '#1E7A46', fontWeight: 700 }}>✓ 로그인됨 · {adminAuth.email}</span>
                <button onClick={handleAdminLogout} style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>로그아웃</button>
              </div>
            ) : (
              <form onSubmit={submitAdminLogin} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="email" required placeholder="이메일" value={authForm.email}
                  onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))} style={{ ...inputStyle, width: 200 }} />
                <input type="password" required placeholder="비밀번호" value={authForm.password}
                  onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} style={{ ...inputStyle, width: 160 }} />
                <button type="submit" disabled={authBusy} style={{ ...btnPrimary, padding: '8px 16px' }}>{authBusy ? '확인 중...' : '로그인'}</button>
              </form>
            )}
            {authError && <div style={{ marginTop: 8, fontSize: 12, color: C.dangerDark }}>{authError}</div>}
          </div>

          <div style={{ marginBottom: 20, padding: '14px 16px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8A5A16', marginBottom: 8 }}>3) 최종 확인</div>
            <div style={{ fontSize: 12.5, color: '#6B4A0F', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
{`현재 재고 목록을 Excel 기준으로 동기화합니다.

- 기존 기록은 삭제되지 않습니다.
- 기존 시약과 Lot ID는 가능한 한 유지됩니다.
- Excel에 없는 현재 재고는 삭제되지 않고 "현재 목록 제외" 처리될 예정입니다.
- 신규 시약과 Lot은 추가될 예정입니다.
- 이 작업은 현재 재고 상태에 영향을 주는 관리자 작업입니다.`}
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 12, color: '#6B4A0F', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                계속하려면 아래에 "{STRONG_CONFIRM_TEXT}" 를 정확히 입력하세요.
              </label>
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
                placeholder={STRONG_CONFIRM_TEXT} style={{ ...inputStyle, maxWidth: 280 }} disabled={!readiness.ready} />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>4) 적용</div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              실제 적용은 <code>sync_inventory_snapshot</code> RPC(Supabase Auth 관리자 + <code>is_admin()</code> 인가, 단일 트랜잭션)로
              처리됩니다. <b>이 RPC를 만드는 DB 변경이 아직 운영에 적용되지 않아 이번 단계에서는 버튼을 계속 막아둡니다.</b>
              준비된 요약: 반영 대상 {payload.rows.length.toLocaleString()}행
              (신규 {summary.new.toLocaleString()} · 변경 {summary.changed.toLocaleString()} · 변경없음 {summary.unchanged.toLocaleString()}),
              제외 예정 {excludedLots.length.toLocaleString()}건.
            </p>
            <button onClick={handleApplySync} disabled style={{
              ...btnPrimary, background: C.muted, cursor: 'not-allowed', opacity: 0.7,
            }} title="DB 적용 전 검토 단계 — Phase 4b-3b에서 migration 적용 후 활성화됩니다">
              동기화 적용 — DB 적용 전 검토 단계
            </button>
            {applyBusy && <span style={{ marginLeft: 10, fontSize: 12, color: C.muted }}>적용 중...</span>}
            {adminAuth.authed && strongConfirmOk && readiness.ready && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: '#1E7A46' }}>✓ 적용 준비 완료(관리자 인증·확인 문구·검증 모두 통과) — 실제 적용은 4b-3b에서 활성화됩니다.</div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <button onClick={() => setStep(4)} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}` }}>← 이전</button>
          </div>
          </>
          )}
        </div>
      )}
    </Card>
  )
}
