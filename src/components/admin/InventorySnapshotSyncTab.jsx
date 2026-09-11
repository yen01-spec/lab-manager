import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabase'
import { C, Card, btnPrimary, btnExcel, inputStyle } from '../../design'
import { fetchAllPages } from '../../lib/fetchAllPages'
import { downloadInventorySnapshotExport, downloadInventorySnapshotBackup } from '../../lib/inventorySnapshotExcel'
import {
  parseInventorySnapshotAoa, runGlobalValidation, buildMatchIndexes, matchInventorySnapshotRows,
  computeExcludedLots, computeArchivedReagentsPreview, buildInventorySnapshotPayload, checkSyncReadiness,
  rowBucket, STRONG_CONFIRM_TEXT, GUIDE_SHEET_NAME,
} from '../../lib/inventorySnapshotMatch'
import InventorySnapshotReviewPanel from './InventorySnapshotReviewPanel'
import InventorySnapshotPreviewTable from './InventorySnapshotPreviewTable'

// ══════════════════════════════════════════════════════════════
//  현재 재고 Excel 동기화 (Phase 4b-2)
//
//  "Excel 일괄 추가"(append-only, 신규만)와는 완전히 다른 기능이다 — 이건 현재 보유 재고
//  전체를 Excel 기준으로 맞추는 current inventory snapshot synchronization.
//  이번 Phase에서는 미리보기까지만 만든다: 실제 INSERT/UPDATE/DELETE/RPC 호출은 전혀 없다
//  (Phase 4b-3에서 supabaseAdmin + is_admin() 기반 RPC로 별도 구현 예정).
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
  const [reagents, lots, { data: locations }] = await Promise.all([
    fetchAllPages((from, to) => supabase.from('reagents')
      .select('id, name, name_ko, cas_no, company, purity, volume, unit, status')
      .neq('status', 'archived').range(from, to)),
    fetchAllPages((from, to) => supabase.from('reagent_lots')
      .select('id, reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock, location_id, shelf_position, received_date, expiry_date, status')
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

export default function InventorySnapshotSyncTab({ student }) {
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
  const payload = useMemo(
    () => buildInventorySnapshotPayload(matchedRows, { snapshotId, sourceFilename: fileName }),
    [matchedRows, snapshotId, fileName],
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
        <br /><b>이 화면(4b-2)에서는 실제로 아무것도 저장하지 않습니다.</b> 검토와 준비까지만 하고, 실제 적용은 이후 단계(4b-3)에서 관리자 인증을 거쳐 진행됩니다.
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

          <div style={{ marginBottom: 20, padding: '14px 16px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8A5A16', marginBottom: 8 }}>2) 최종 확인</div>
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
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>3) 적용</div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              실제 적용은 Supabase Auth 관리자 로그인(자료 CMS와 동일한 <code>admin_users</code> + <code>is_admin()</code> 구조) 기반 RPC로 처리될 예정입니다(Phase 4b-3).
              이번 단계에서는 실행되지 않습니다. 준비된 요약: 반영 대상 {payload.rows.length.toLocaleString()}행
              (신규 {summary.new.toLocaleString()} · 변경 {summary.changed.toLocaleString()} · 변경없음 {summary.unchanged.toLocaleString()}),
              제외 예정 {excludedLots.length.toLocaleString()}건.
            </p>
            <button disabled style={{
              ...btnPrimary, background: C.muted, cursor: 'not-allowed', opacity: 0.7,
            }} title="Phase 4b-3에서 RPC가 만들어진 뒤 활성화됩니다">
              동기화 적용 — Phase 4b-3에서 활성화
            </button>
            {student && strongConfirmOk && readiness.ready && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: '#1E7A46' }}>✓ 적용 준비 완료 (실제 적용 대기 — RPC 없음)</div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <button onClick={() => setStep(4)} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}` }}>← 이전</button>
          </div>
        </div>
      )}
    </Card>
  )
}
