# lab-manager-v2

강원대 화학교육 연구실 시약관리 시스템 (React 19 + Vite + Supabase).

- 운영 구조·권한 모델·워크플로우: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- 관리자 계정 이후 production 적용 순서·학교 이전 체크리스트: [`docs/PRODUCTION_GATE_RUNBOOK.md`](docs/PRODUCTION_GATE_RUNBOOK.md)

## 개발
```bash
npm install
npm run dev          # .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 사용 (git 에 넣지 않음)
npm run lint && npm run build
```
UI 테스트(가짜 Supabase, 실제 연결 없음): `node scripts/ui/serve-mock.mjs` 후 `node scripts/ui/test-*.mjs`.

## 원칙 (요약)
- production(`ylvebibsevesazntalos`)은 기본 READ ONLY. 변경은 staging(`vvafhcqypvejvsuksooi`) 검증 → guard → dry-run → 승인된 Gate 에서만.
- guard 는 파이프에 넣지 말고 단독 실행: `node scripts/guard-staging-target.mjs`.
- 비밀값(service_role, DB 비밀번호, 관리자 비밀번호)은 저장소·CLI 인자에 두지 않는다.
