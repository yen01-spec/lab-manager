import { useEffect, useState } from 'react'
import { supabaseAdmin } from '../../supabase'
import { C, Card, btnExcel, btnGhost, btnPrimary, inputStyle, thStyle, tdStyle } from '../../design'
import pkg from '../../../package.json'

// ══════════════════════════════════════════════
//  백업 / 복원 — 두 가지 모드(둘 다 "빈 대상" 전체 복원만, 병합·덮어쓰기 없음)
//   A. 핵심 시약·재고  B. 전체 시스템(핵심 + 구매요청 + 공지·자료·첨부 Storage 파일 + 허용된 설정)
//  · 복원: 파일 검증 → dry-run(쓰기 0) → 최종 확인 → [Storage 업로드 → 검증 → DB 단일 트랜잭션 → 실패 시 정리]
//  · ⚠ DB 는 단일 트랜잭션이지만 Storage 는 별개 시스템이라 하나로 묶을 수 없다 → 안전 순서 + 실패 시 정리로 대응.
//  · 복원 "실행"은 서버 설정(restore_enabled)이 켜진 환경(staging)에서만 가능하다. 운영은 기본 비활성.
// ══════════════════════════════════════════════
const JOURNAL_KEY = 'lm_restore_journal'
const journal = {
  save(v) { try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(v)) } catch { /* 저장 실패는 무시 */ } },
  clear() { try { localStorage.removeItem(JOURNAL_KEY) } catch { /* 무시 */ } },
  read() { try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || 'null') } catch { return null } },
}
function saveFile(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}` }
const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)
const rpc = (name, args) => supabaseAdmin.rpc(name, args)
const MODE_LABEL = { core: '핵심 시약·재고 백업', full: '전체 시스템 백업' }

export default function BackupRestoreTab() {
  const [status, setStatus] = useState({ state: 'loading' })
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState('')
  const [msg, setMsg] = useState(null)
  const [file, setFile] = useState(null)         // { name, payload, manifest, storageObjects, problems }
  const [dry, setDry] = useState(null)
  const [preBackupDone, setPreBackupDone] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [result, setResult] = useState(null)
  const [pendingJournal, setPendingJournal] = useState(() => journal.read())

  useEffect(() => {
    let alive = true
    rpc('admin_restore_status').then(({ data, error }) => {
      if (!alive) return
      setStatus(error ? { state: 'unavailable', message: error.message } : { state: 'ok', ...data })
    })
    return () => { alive = false }
  }, [])

  // kind: 'zip' | 'xlsx' | 'pre'(복원 직전 안전 백업 = 복원할 파일과 같은 모드의 ZIP). mode: 'core' | 'full'
  async function downloadBackup(kind, mode) {
    const pre = kind === 'pre'
    setBusy(pre ? 'pre' : `${mode}-${kind}`); setMsg(null); setProgress('')
    try {
      const { data: snapshot, error } = await rpc('admin_backup_export', { p_mode: mode })
      if (error) throw new Error(error.message)
      const base = `${pre ? '복원전_' : ''}lab-${mode === 'full' ? 'system' : 'core'}-backup_${stamp()}`
      let storage = null
      if (mode === 'full') {
        const [{ collectStorage, findUnreferenced }, { storageBase }] = await Promise.all([import('../../lib/storageBackup'), import('../../lib/storageBase')])
        storage = await collectStorage(supabaseAdmin, snapshot.storage_refs || [], { base: storageBase(supabaseAdmin), onProgress: p => setProgress(p.total ? `Storage 파일 내려받는 중 ${p.done}/${p.total}` : '') })
        storage.unreferenced = await findUnreferenced(supabaseAdmin, ['documents'], snapshot.storage_refs || [])
      }
      if (kind === 'xlsx') {
        const { backupExcelBuffer } = await import('../../lib/backupExcel')
        saveFile(await backupExcelBuffer(snapshot, { appVersion: pkg.version, storage }), `${base}_조회용.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      } else {
        const { buildBackupZip } = await import('../../lib/backupZip')
        saveFile(await buildBackupZip(snapshot, { appVersion: pkg.version, storage }), `${base}.zip`, 'application/zip')
      }
      const total = Object.values(snapshot.table_counts).reduce((a, b) => a + b, 0)
      const files = storage ? ` · Storage 파일 ${storage.objects.length}개(${fmtBytes(storage.objects.reduce((a, o) => a + o.size, 0))})${storage.missing.length ? ` · 링크만 있고 파일이 없는 항목 ${storage.missing.length}개` : ''}` : ''
      setMsg({ kind: 'ok', text: `${MODE_LABEL[mode]} — ${kind === 'xlsx' ? '조회용 Excel' : '복원용 ZIP'}을 내려받았습니다 (${snapshot.table_order.length}개 테이블 · ${total}행${files}).${kind === 'xlsx' ? ' 이 파일로는 복원할 수 없습니다.' : ''}` })
      if (pre) setPreBackupDone(true)
    } catch (e) { setMsg({ kind: 'err', text: `백업 실패: ${e.message}` }) }
    setBusy(''); setProgress('')
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
    try {
      const [{ dryRunAll }, { storageBase }] = await Promise.all([import('../../lib/storageRestore'), import('../../lib/storageBase')])
      setDry(await dryRunAll({ client: supabaseAdmin, rpc, parsed: file, targetBase: storageBase(supabaseAdmin), log: setProgress }))
    } catch (e) { setMsg({ kind: 'err', text: `검증 실패: ${e.message}` }) }
    setBusy(''); setProgress('')
  }

  async function runRestore() {
    if (!window.confirm(`${MODE_LABEL[file.payload.backup_mode]}을(를) 빈 대상에 복원합니다. 되돌릴 수 없습니다. 계속할까요?`)) return
    setBusy('restore'); setMsg(null)
    try {
      const [{ executeRestore }, { storageBase }] = await Promise.all([import('../../lib/storageRestore'), import('../../lib/storageBase')])
      const r = await executeRestore({
        client: supabaseAdmin, rpc, parsed: file, targetBase: storageBase(supabaseAdmin), confirm: confirmText, journal,
        onProgress: p => setProgress(p.phase === 'upload' ? `Storage 업로드 ${p.done + 1}/${p.total}` : p.phase === 'verify' ? `업로드 검증 ${p.done + 1}/${p.total}` : p.phase === 'db' ? 'DB 복원(단일 트랜잭션)…' : p.phase === 'cleanup' ? '실패 — 올린 파일 정리 중…' : ''),
      })
      setPendingJournal(journal.read())
      if (r.ok) setResult(r)
      else setMsg({ kind: 'err', text: `복원 실패(${r.stage}) — ${r.error || (r.issues || []).map(i => i.message).join(' / ')}. DB 는 변경되지 않았습니다.${r.cleanup ? ` 올린 Storage 파일 정리: 삭제 ${r.cleanup.removed.length}개${r.cleanup.failed.length ? ` · 삭제 실패 ${r.cleanup.failed.length}개(수동 정리 필요: ${r.cleanup.failed.map(f => f.key).join(', ')})` : ''}.` : ''}` })
    } catch (e) { setMsg({ kind: 'err', text: `복원 중 오류: ${e.message}` }) }
    setBusy(''); setProgress('')
  }

  async function runCleanup() {
    if (!file?.payload || file.payload.backup_mode !== 'full') { setMsg({ kind: 'err', text: '중단된 복원을 정리하려면 그 복원에 쓰던 전체 시스템 백업 ZIP 을 먼저 선택하세요.' }); return }
    setBusy('cleanup'); setMsg(null)
    try {
      const { cleanupInterruptedRestore } = await import('../../lib/storageRestore')
      const r = await cleanupInterruptedRestore({ client: supabaseAdmin, rpc, parsed: file })
      if (r.ok) { journal.clear(); setPendingJournal(null) }
      setMsg({ kind: r.ok ? 'ok' : 'err', text: r.error || `정리 완료 — 삭제 ${r.removed.length}개${r.kept.length ? ` · 내용이 달라 건드리지 않음 ${r.kept.length}개` : ''}${r.failed.length ? ` · 삭제 실패 ${r.failed.length}개` : ''}` })
    } catch (e) { setMsg({ kind: 'err', text: `정리 실패: ${e.message}` }) }
    setBusy('')
  }

  const enabled = status.state === 'ok' && status.enabled
  const mode = file?.payload?.backup_mode
  const canRun = enabled && dry?.ok && preBackupDone && confirmText === 'RESTORE' && !busy
  const table = (title, obj) => obj && (
    <table style={{ borderCollapse: 'collapse', minWidth: 300, marginTop: 6 }}>
      <thead><tr><th style={thStyle}>{title}</th><th style={thStyle}>행 수</th></tr></thead>
      <tbody>{Object.entries(obj).map(([k, v]) => <tr key={k}><td style={tdStyle}>{k}</td><td style={{ ...tdStyle, textAlign: 'right' }}>{v}</td></tr>)}</tbody>
    </table>
  )
  const backupButtons = (m) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => downloadBackup('zip', m)} disabled={!!busy} style={{ ...btnExcel, opacity: busy ? 0.5 : 1 }}>
        {busy === `${m}-zip` ? '만드는 중…' : `📥 ${m === 'full' ? '전체 시스템 ' : '핵심 '}복원용 백업 내려받기 (ZIP)`}
      </button>
      <button type="button" onClick={() => downloadBackup('xlsx', m)} disabled={!!busy} style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}>
        {busy === `${m}-xlsx` ? '만드는 중…' : '📄 조회용 Excel 내려받기'}
      </button>
    </div>
  )
  const PII = '학생 명단에는 생년월일이 있으니 백업 파일을 안전하게 보관하세요.'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="💾 핵심 시약·재고 백업" sub="모드 A · 시약, 병(Lot), 위치, 실사, 관련 이력 중심">
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          범위: 시약 · Lot(병) · 위치 · 요청/이력 · 재고실사 · 관리 기록 · 학생 명단. 포함하지 않음: 구매요청, 공지·자료·첨부 파일, 앱 설정, 로그인(Auth) 계정, 관리자 등록(admin_users), 알림 토큰, 학생 로그인 세션. {PII}
        </div>
        {backupButtons('core')}
      </Card>

      <Card title="🗄️ 전체 시스템 백업" sub="모드 B · 핵심 데이터 + 구매요청 + 공지·자료·첨부 파일(Storage) + 안전한 설정">
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          범위: 핵심 데이터 전부 + 구매요청(신·구) + 공지/첨부 + 자료(공식 양식) + <b>Storage 실제 파일</b>(공지 첨부, 자료 파일, MSDS 업로드) + 허용된 설정 키(연구실 이름·연락처·링크 등).
          포함하지 않음: 관리자/슈퍼 비밀번호 등 비밀 설정, Auth 계정, admin_users, 알림 토큰, 학생 세션, 화학물질 참조 마스터(school_chemical_master). 파일이 많으면 시간이 걸립니다. {PII}
        </div>
        {backupButtons('full')}
      </Card>

      <Card title="♻️ 전체 복원" sub="두 모드 모두 빈 대상에만 · 병합/덮어쓰기 없음">
        {status.state === 'loading' && <div style={{ color: C.muted }}>상태 확인 중…</div>}
        {status.state === 'unavailable' && <div role="alert" style={{ color: '#C13B3F', fontSize: 13 }}>이 환경에는 백업/복원 기능이 설치되어 있지 않습니다. ({status.message})</div>}
        {status.state === 'ok' && (
          <>
            <div data-testid="restore-status" style={{ background: enabled ? '#E8F5E9' : '#FBF0DF', color: enabled ? '#276749' : '#8A5A16', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
              {enabled ? '이 환경은 복원 실행이 허용되어 있습니다(테스트/복구 환경).' : '복원 실행은 이 환경에서 비활성화되어 있습니다(운영 기본값). 파일 검증(dry-run)만 할 수 있고, 데이터는 바뀌지 않습니다.'}
            </div>
            <div data-testid="atomicity-note" style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
              ⚠ DB 복원은 단일 트랜잭션이지만 <b>Storage 파일은 별개 시스템</b>이라 DB와 하나로 묶을 수 없습니다. 그래서 전체 시스템 복원은
              ① 검증 → ② 파일 업로드(덮어쓰기 금지) → ③ 업로드 검증 → ④ DB 복원 순서로 진행하고, 중간에 실패하면 올린 파일을 삭제합니다.
            </div>
            <input type="file" accept=".zip" onChange={onPickFile} aria-label="백업 ZIP 선택" style={{ ...inputStyle, maxWidth: 420 }} />
            {file && (
              <div style={{ marginTop: 12, fontSize: 12.5 }}>
                <div>
                  <span data-testid="restore-mode" style={{ background: mode === 'full' ? '#E6F0FF' : '#F1F5EA', borderRadius: 10, padding: '2px 10px', fontWeight: 700, marginRight: 6 }}>{MODE_LABEL[mode] || '알 수 없는 모드'}</span>
                  <b>{file.name}</b> · backup_version {file.manifest?.backup_version} · 작성 {String(file.manifest?.created_at || '').slice(0, 19).replace('T', ' ')} · app {file.manifest?.app_version} · schema {file.manifest?.schema_version}
                </div>
                {mode === 'full' && file.manifest?.storage && (
                  <div data-testid="storage-summary" style={{ marginTop: 4 }}>Storage 파일 {file.manifest.storage.objects.length}개 ({fmtBytes(file.manifest.storage.objects.reduce((a, o) => a + o.size, 0))}) · 링크만 있고 파일 없음 {file.manifest.storage.missing.length}개 · 참조 없는 파일(백업 제외) {file.manifest.storage.unreferenced.length}개</div>
                )}
                {file.problems.length > 0 && <ul role="alert" style={{ color: '#C13B3F' }}>{file.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                {file.manifest && table('테이블', file.manifest.table_counts)}
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={runDry} disabled={!!busy || file.problems.length > 0} style={{ ...btnGhost, opacity: busy || file.problems.length ? 0.5 : 1 }}>
                    {busy === 'dry' ? '검증 중…' : '① 검증(dry-run) — DB·Storage 변경 없음'}
                  </button>
                </div>
              </div>
            )}
            {dry && (
              <div data-testid="dry-report" style={{ marginTop: 12, fontSize: 12.5 }}>
                {dry.ok
                  ? <div style={{ color: '#276749', fontWeight: 700 }}>✔ 검증 통과 — 대상이 비어 있고, PK/FK/제약/digest{mode === 'full' ? '와 Storage 파일(경로·sha256·충돌)' : ''}이 모두 맞습니다. (dry-run: 실제 변경 0)</div>
                  : <div style={{ color: '#C13B3F', fontWeight: 700 }}>✖ 복원할 수 없습니다 — 아래 문제를 해결하세요.</div>}
                {dry.issues?.length > 0 && <ul>{dry.issues.map((i, k) => <li key={k}><b>{i.table || i.code}</b>: {i.message}</li>)}</ul>}
                {dry.ok && dry.db?.would_insert && table('복원 예정', dry.db.would_insert)}
                {dry.ok && dry.missingRefs?.length > 0 && <div style={{ color: '#8A5A16' }}>백업 시점에 이미 파일이 없던 링크 {dry.missingRefs.length}개는 그대로(링크만) 복원됩니다.</div>}
              </div>
            )}
            {dry?.ok && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  <button type="button" onClick={() => downloadBackup('pre', mode)} disabled={!!busy} style={btnGhost}>② 복원 전 현재 상태 백업 내려받기 ({MODE_LABEL[mode]}){preBackupDone ? ' ✔' : ''}</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESTORE 입력" aria-label="확인 문구" style={{ ...inputStyle, maxWidth: 180 }} disabled={!enabled} />
                  <button type="button" onClick={runRestore} disabled={!canRun} style={{ ...btnPrimary, background: '#C13B3F', opacity: canRun ? 1 : 0.45, cursor: canRun ? 'pointer' : 'not-allowed' }}>
                    {busy === 'restore' ? '복원 중…' : '③ 복원 실행'}
                  </button>
                  {!enabled && <span style={{ color: C.muted, fontSize: 12 }}>이 환경에서는 실행할 수 없습니다.</span>}
                </div>
              </div>
            )}
            {progress && <div role="status" style={{ marginTop: 8, fontSize: 12.5, color: C.muted }}>{progress}</div>}
            {result && (
              <div data-testid="restore-result" style={{ marginTop: 12, fontSize: 12.5, color: '#276749' }}>
                <b>복원 완료</b> — DB digest 검증 통과{result.mode === 'full' ? ` · Storage 파일 ${result.storageUploaded}개 업로드·검증 완료` : ''}.
                {table('복원된 행', result.db?.inserted)}
              </div>
            )}
            {(pendingJournal || mode === 'full') && (
              <div data-testid="cleanup-box" style={{ marginTop: 14, borderTop: `1px dashed ${C.border}`, paddingTop: 10, fontSize: 12, color: C.muted }}>
                {pendingJournal && <div style={{ color: '#9C2B2B', marginBottom: 6 }}>⚠ 이전 복원이 중간에 중단된 기록이 있습니다({pendingJournal.mode} · {String(pendingJournal.startedAt || '').slice(0, 19).replace('T', ' ')}). 그 복원에 쓰던 전체 시스템 백업 ZIP 을 선택한 뒤 아래 정리를 실행하세요.</div>}
                <button type="button" onClick={runCleanup} disabled={!!busy || mode !== 'full'} style={{ ...btnGhost, padding: '5px 12px', fontSize: 12, opacity: busy || mode !== 'full' ? 0.5 : 1 }}>중단된 복원의 Storage 파일 정리</button>
                <span style={{ marginLeft: 8 }}>DB 가 비어 있고 백업과 내용(sha256)이 같은 파일만 삭제합니다.</span>
              </div>
            )}
          </>
        )}
        {msg && <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: msg.kind === 'ok' ? '#276749' : '#C13B3F' }}>{msg.text}</div>}
      </Card>
    </div>
  )
}
