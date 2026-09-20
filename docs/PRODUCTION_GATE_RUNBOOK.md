# Production Gate 런북 — 관리자 계정이 생긴 뒤의 정확한 순서

**전제**: 지금까지의 보안 마이그레이션은 **production 에 적용되지 않았다**(staging 에서만 검증). 새 프론트(v2-redesign)는 이 마이그레이션의 RPC/권한을 전제로 하므로 **프론트 배포와 마이그레이션 적용은 반드시 한 번에 조율**해야 한다(옛 프론트 + 새 DB, 또는 새 프론트 + 옛 DB 는 둘 다 동작하지 않는 화면이 생긴다).

## A. 사전 준비(사용자 작업)
1. Supabase Auth 관리자 계정 생성(대시보드 → Authentication → 사용자 추가).
2. SQL Editor 에서 `admin_users` 에 등록: `insert into admin_users (user_id, active, note) values ('<auth user uuid>', true, '표시할 이름');` — `note` 가 승인자 이름으로 기록된다(없으면 이메일).
3. 앱에서 관리자 로그인 → 브라우저 콘솔/화면으로 `is_admin()` true 확인(관리자 메뉴가 열리면 통과).

## B. 적용 전 점검 (READ ONLY)
1. `node scripts/guard-production-target.mjs` (단독 실행, exit 0)
2. 백업: 재고 Excel 백업 + `scripts/production-inventory-backup.mjs`.
3. `supabase db push --linked --dry-run` → 대기 중 마이그레이션(10개)이 정확히 아래 목록인지 확인(순서 중요):
   `20260916090000_harden_student_auth` → `20260916100000_student_session_tokens` → `20260916110000_secure_request_submissions` → `20260920090000_secure_admin_reviews` → `20260920100000_least_privilege_acl` → `20260920110000_retire_student_admin_pin` → `20260920120000_inventory_workflow` → `20260920130000_reagent_domain_rpcs` → `20260922090000_request_unification` → `20260923090000_bottle_unit_requests`
4. `scripts/production-preflight-*.sql`, `scripts/production-check-*.sql` 재실행(읽기 전용)으로 컬럼/제약이 예상과 같은지 확인. 특히 `reagent_lots` 에 `KNU-YYYYMMDD-NNN` 형식 중복이 없는지(유일 인덱스 생성 전제 — 2026-09-20 확인 시 0건).

## C. 적용
1. 학생 로그인 세션은 전부 무효가 된다(새 토큰 체계) — 사용자에게 미리 공지.
2. `supabase db push --linked` (guard 통과 후). 실패 시 즉시 중단 — RPC/정책은 트랜잭션 단위라 부분 적용 상태를 확인 후 보고.
3. **곧바로** 새 프론트를 배포(Vercel).
4. 검증(관리자 계정으로): 요청 승인/반려, 폐기 처리, 재고 조정/이동, 시약 1건 추가, 설정 저장, 공지 등록, 자료(CMS) — 모두 동작해야 한다. 학생 계정으로: 로그인/등록, 시약 등록, Lot 추가, 정보확인, 신청 3종, 구매요청서.
5. 재고실사는 짧은 테스트 세션(1개 위치)으로 ①~④ 전체를 한 번 돌려본다(취소 가능).

## D. 재고 동기화 P2 (별도 Gate)
1. production 재고 백업 후, **변경 없는(unchanged) 스냅샷**으로 `sync_inventory_snapshot` 1회 실행.
2. production 재고 데이터 변화 0 검증(`scripts/production/verify-first-unchanged-sync.mjs`).
3. 문제 없을 때만 Inventory Apply 버튼 활성화(코드에서 hard-disable 해제는 별도 커밋).

## E. Dead-object 정리 (별도 Gate)
`supabase/pending-cleanup/20260921090000_drop_unused_empty_tables.sql` 을 migrations 로 옮겨 적용(행 0 가드 포함). 대상 외 후보(items 계열 등)는 사용자 결정 필요.

## F. 학교 공용 Supabase 이전 전 체크리스트
- [ ] 앱 최종 완료(위 A~E 끝, 사용자 회귀 확인)
- [ ] 학교 공용 Organization 에 owner/admin 이 될 학교 계정 준비
- [ ] production/staging 프로젝트 Transfer(Organization 이전) — API URL/키는 유지되지만 결제/멤버십 변경 확인
- [ ] 학교 공용 앱 관리자 계정 구성(Auth 사용자 + `admin_users`)
- [ ] 개인 계정 제거(Organization 멤버·`admin_users`·GitHub/Vercel 연동 점검)
- [ ] Vercel 환경변수(`VITE_SUPABASE_URL/ANON_KEY`)·FCM 키·GHS API 키 재발급 및 교체
- [ ] baseline migration 작성(최종 schema 확정 후) — `docs/OPERATIONS.md` §11
