// Regression test for the guard|tail pipefail bug (Phase S-RLS2 §1) -- a guard check
// piped into tail/grep/head/tee before `&&` silently loses its exit code (the pipeline's
// exit code is the LAST command's, not the guard's), so a failed guard doesn't stop the
// dangerous command that follows. This happened once during this session (read-only query
// accidentally ran against production while a staging guard silently "failed" through
// `| tail -1 && ...`). This test statically scans the repo for that shape so it can't ship
// again in a committed script/config.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
const RISKY = /guard[^\n]*\|\s*(tail|head|grep|tee|awk|sed)\b/i

let failures = []

// 1) package.json scripts
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  if (RISKY.test(cmd)) failures.push(`package.json script "${name}": ${cmd}`)
}

// 2) every tracked-style script file under scripts/ (mjs/sql/sh comments/examples included,
//    since a risky example in a comment is exactly what a future session would copy-paste).
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if (!/\.(mjs|js|sql|sh|md)$/.test(entry.name)) continue
    if (full === path.join(ROOT, 'scripts', 'test-guard-pipeline-safety.mjs')) continue
    const text = readFileSync(full, 'utf-8')
    for (const line of text.split('\n')) {
      if (RISKY.test(line)) failures.push(`${path.relative(ROOT, full)}: ${line.trim()}`)
    }
  }
}
walk(path.join(ROOT, 'scripts'))

if (failures.length > 0) {
  console.error('[FAIL] guard|pipe pattern found (exit code would be silently swallowed):')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
} else {
  console.log(`[PASS] no guard|${'{tail,head,grep,tee,awk,sed}'} pipeline pattern found in package.json or scripts/`)
}
