import { useEffect, useRef, useState } from 'react'
import { supabaseAdmin } from '../../supabase'
import { C, Card, btnExcel, btnGhost, btnPrimary, inputStyle, thStyle, tdStyle } from '../../design'
import pkg from '../../../package.json'

// ══════════════════════════════════════════════
//  전체 백업 / 전체 복원(빈 대상)
//  · 백업: JSON ZIP(복원용) + Excel(조회용). 서버 RPC admin_backup_export 스냅샷.
//  · 복원: 파일 검증(sha256/행 수) → 서버 dry-run(쓰기 0) → 최종 확인 → 단일 트랜잭션 실행.
//    복원 "실행"은 서버 설정(restore_enabled)이 켜진 환경(staging)에서만 가능하다. 운영은 기본 비활성.
// ══════════════════════════════════════════════
function saveFile(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}` }

export default function BackupRestoreTab() {
  const [status, setStatus] = useState({ state: 'loading' })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [file, setFile] = useState(null)         // { name, payload, manifest, problems }
  const [dry, setDry] = useState(null)
  const [preBackupDone, setPreBackupDone] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    let alive = true
    supabaseAdmin.rpc('admin_restore_status').then(({ data, error }) => {
      if (!alive) return
      setStatus(error ? { state: 'unavailable', message: error.message } : { state: 'ok', ...data })
    })
    return () => { alive = false }
  }, [])

  // kind: 'zip'(복원용) | 'xlsx'(조회용) | 'pre'(복원 직전 안전 백업 = ZIP). 파일 하나씩 내려받는다(브라우저의 다중 다운로드 차단 회피).
  async function downloadBackup(kind = 'zip') {
    const pre = kind === 'pre'
    setBusy(pre ? 'pre' : kind); setMsg(null)
    try {
      const { data: snapshot, error } = await supabaseAdmin.rpc('admin_backup_export')
      if (error) throw new Error(error.message)
      const base = `${pre ? '복원전_' : ''}lab-backup_${stamp()}`
      if (kind === 'xlsx') {
        const { backupExcelBuffer } = await import('../../lib/backupExcel')
        saveFile(await backupExcelBuffer(snapshot, { appVersion: pkg.version }), `${base}_조회용.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      } else {
        const { buildBackupZip } = await import('../../lib/backupZip')
        saveFile(await buildBackupZip(snapshot, { appVersion: pkg.version }), `${base}.zip`, 'application/zip')
      }
      const total = Object.values(snapshot.table_counts).reduce((a, b) => a + b, 0)
      setMsg({ kind: 'ok', text: `${kind === 'xlsx' ? '조회용 Excel' : '복원용 ZIP'}을 내려받았습니다 (${snapshot.table_order.length}개 테이블 · ${total}행).${kind === 'xlsx' ? ' 이 파일로는 복원할 수 없습니다.' : ''}` })
      if (pre) setPreBackupDone(true)
    } catch (e) { setMsg({ kind: 'err', text: `백업 실패: ${e.message}` }) }
    setBusy('')
  }

  async function onPickFile(e) {
    const f = e.target.files?.[0]
    setDry(null); setResult(null); setFile(null); setConfirmText(''); setPreBackupDone(false); setMsg(null)
    if (!f) return
    setBusy('read')
    try {
      const { readBackupZip } = await import('../../lib/backupZip')
      const r = await readBackupZip(new Uint8Array(await f.arrayBuffer()))
      setFile({ name: f.name, ...r })
    } catch (err) { setMsg({ kind: 'err', text: `파일을 읽지 못했습니다: ${err.message}` }) }
    setBusy('')
  }

  async function runDry() {
    setBusy('dry'); setMsg(null); setDry(null)
    const { data, error } = await supabaseAdmin.rpc('admin_restore_full', { p_payload: file.payload, p_dry_run: true, p_confirm: null })
    setBusy('')
    if (error) { setMsg({ kind: 'err', text: `검증 실패: ${error.message}` }); return }
    setDry(data)
  }

  async function runRestore() {
    if (!window.confirm('빈 대상 DB에 전체 복원을 실행합니다. 되돌릴 수 없습니다. 계속할까요?')) return
    setBusy('restore'); setMsg(null)
    const { data, error } = await supabaseAdmin.rpc('admin_restore_full', { p_payload: file.payload, p_dry_run: false, p_confirm: confirmText })
    setBusy('')
    if (error) { setMsg({ kind: 'err', text: `복원 실패(전체 롤백됨): ${error.message}` }); return }
    setResult(data)
  }

  const enabled = status.state === 'ok' && status.enabled
  const canRun = enabled && dry?.ok && preBackupDone && confirmText === 'RESTORE' && !busy
  const table = (title, obj) => obj && (
    <table style={{ borderCollapse: 'collapse', minWidth: 300, marginTop: 6 }}>
      <thead><tr><th style={thStyle}>{title}</th><th style={thStyle}>행 수</th></tr></thead>
      <tbody>{Object.entries(obj).map(([k, v]) => <tr key={k}><td style={tdStyle}>{k}</td><td style={{ ...tdStyle, textAlign: 'right' }}>{v}</td></tr>)}</tbody>
    </table>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="💾 전체 백업" sub="JSON ZIP(복원용) + Excel(조회용)">
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          범위: 시약 · Lot(병) · 위치 · 요청/이력 · 재고실사 · 관리 기록 · 학생 명단. 포함하지 않음: 로그인(Auth) 계정, 관리자 등록(admin_users), 알림 토큰, 학생 로그인 세션, 앱 설정, 업로드 파일.
          학생 명단에는 생년월일이 있으니 백업 파일을 안전하게 보관하세요.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => downloadBackup('zip')} disabled={!!busy} style={{ ...btnExcel, opacity: busy ? 0.5 : 1 }}>
            {busy === 'zip' ? '만드는 중…' : '📥 복원용 백업 내려받기 (ZIP)'}
          </button>
          <button type="button" onClick={() => downloadBackup('xlsx')} disabled={!!busy} style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}>
            {busy === 'xlsx' ? '만드는 중…' : '📄 조회용 Excel 내려받기'}
          </button>
        </div>
      </Card>

      <Card title="♻️ 전체 복원" sub="빈 대상에만 · 기존 데이터를 덮어쓰지 않음">
        {status.state === 'loading' && <div style={{ color: C.muted }}>상태 확인 중…</div>}
        {status.state === 'unavailable' && <div role="alert" style={{ color: '#C13B3F', fontSize: 13 }}>이 환경에는 백업/복원 기능이 설치되어 있지 않습니다. ({status.message})</div>}
        {status.state === 'ok' && (
          <>
            <div data-testid="restore-status" style={{ background: enabled ? '#E8F5E9' : '#FBF0DF', color: enabled ? '#276749' : '#8A5A16', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
              {enabled ? '이 환경은 복원 실행이 허용되어 있습니다(테스트/복구 환경).' : '복원 실행은 이 환경에서 비활성화되어 있습니다(운영 기본값). 파일 검증(dry-run)만 할 수 있고, 데이터는 바뀌지 않습니다.'}
            </div>
            <input ref={fileRef} type="file" accept=".zip" onChange={onPickFile} aria-label="백업 ZIP 선택" style={{ ...inputStyle, maxWidth: 420 }} />
            {file && (
              <div style={{ marginTop: 12, fontSize: 12.5 }}>
                <div><b>{file.name}</b> · backup_version {file.manifest?.backup_version} · 작성 {String(file.manifest?.created_at || '').slice(0, 19).replace('T', ' ')} · app {file.manifest?.app_version} · schema {file.manifest?.schema_version}</div>
                {file.problems.length > 0 && <ul role="alert" style={{ color: '#C13B3F' }}>{file.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                {file.manifest && table('테이블', file.manifest.table_counts)}
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={runDry} disabled={!!busy || file.problems.length > 0} style={{ ...btnGhost, opacity: busy || file.problems.length ? 0.5 : 1 }}>
                    {busy === 'dry' ? '검증 중…' : '① 검증(dry-run) — DB 변경 없음'}
                  </button>
                </div>
              </div>
            )}
            {dry && (
              <div data-testid="dry-report" style={{ marginTop: 12, fontSize: 12.5 }}>
                {dry.ok
                  ? <div style={{ color: '#276749', fontWeight: 700 }}>✔ 검증 통과 — 대상이 비어 있고, PK/FK/제약/digest 가 모두 맞습니다. (dry-run: 실제 변경 0)</div>
                  : <div style={{ color: '#C13B3F', fontWeight: 700 }}>✖ 복원할 수 없습니다 — {dry.error || '아래 문제를 해결하세요.'}</div>}
                {dry.issues?.length > 0 && <ul>{dry.issues.map((i, k) => <li key={k}><b>{i.table || i.code}</b>: {i.message}</li>)}</ul>}
                {dry.would_insert && table('복원 예정', dry.would_insert)}
              </div>
            )}
            {dry?.ok && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  <button type="button" onClick={() => downloadBackup('pre')} disabled={!!busy} style={btnGhost}>② 복원 전 현재 DB 백업 내려받기{preBackupDone ? ' ✔' : ''}</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESTORE 입력" aria-label="확인 문구" style={{ ...inputStyle, maxWidth: 180 }} disabled={!enabled} />
                  <button type="button" onClick={runRestore} disabled={!canRun} style={{ ...btnPrimary, background: '#C13B3F', opacity: canRun ? 1 : 0.45, cursor: canRun ? 'pointer' : 'not-allowed' }}>
                    {busy === 'restore' ? '복원 중…' : '③ 전체 복원 실행'}
                  </button>
                  {!enabled && <span style={{ color: C.muted, fontSize: 12 }}>이 환경에서는 실행할 수 없습니다.</span>}
                </div>
              </div>
            )}
            {result && (
              <div data-testid="restore-result" style={{ marginTop: 12, fontSize: 12.5, color: '#276749' }}>
                <b>복원 완료</b> — digest 검증 통과.
                {table('복원된 행', result.inserted)}
              </div>
            )}
          </>
        )}
        {msg && <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: msg.kind === 'ok' ? '#276749' : '#C13B3F' }}>{msg.text}</div>}
      </Card>
    </div>
  )
}
