# 운영 가이드 (lab-manager-v2)

강원대 화학교육 연구실 시약관리 앱 — React + Vite + Supabase. 이 문서는 **현재 운영 구조와 절대 원칙**을 기록한다.
(비밀값·키·비밀번호는 이 저장소 어디에도 두지 않는다. 아래 "환경" 참고.)

## 1. 프로젝트

| | ref | 용도 |
|---|---|---|
| **production** `lab-manager` | `ylvebibsevesazntalos` | 실제 운영. **기본 READ ONLY** — 별도 Gate 승인 없이는 어떤 쓰기도 하지 않는다 |
| **staging** `lab-manager-staging` | `vvafhcqypvejvsuksooi` | 마이그레이션/보안/RPC 실험·회귀 검증. fixture(최소 schema)만 있음 |

ref 상수는 `scripts/supabase-refs.mjs` 한 곳에만 있다.

## 2. 환경/비밀 원칙
- `.env`, `.env.local`, `.env.staging.local` 은 **git에 넣지 않는다**(`.gitignore`). 프론트에는 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`(공개 anon 키)만 들어간다.
- `service_role` 키·DB 비밀번호·관리자 비밀번호는 파일/커밋/CLI 인자에 저장하지 않는다. staging 테스트가 service key 를 필요로 할 때는 셸 환경변수로만 전달한다(예: `SUPABASE_SERVICE_ROLE_KEY=... node scripts/staging/test-*.mjs`).
- 운영 데이터 백업(`inventory_before_sync_*.xlsx` 등)은 커밋 금지(`.gitignore`에 패턴 등록됨). 백업 보관 위치: 사용자 문서 폴더(`Documents/lab-manager-backups`) — 저장소 밖.
- 알려진 노출: `ReagentDetail.jsx` 의 공공데이터포털(data.go.kr) GHS 조회 `serviceKey` 가 소스에 하드코딩돼 있다(브라우저에서 직접 호출하는 공개 API 키라 클라이언트 노출 자체는 불가피). **키 재발급 + `VITE_` 환경변수 이전은 사용자 조치 필요**.

## 3. 마이그레이션 원칙 (staging-first)
1. 모든 스키마 변경은 `supabase/migrations/` 에 파일로 남긴다. **staging 에서 먼저** 적용·검증한다.
2. 적용 전 **guard** 를 *단독으로* 실행하고 exit 0 을 확인한다(파이프 금지 — `guard | tail && cmd` 는 guard 실패를 삼킨다. 실제로 겪은 사고. `scripts/test-guard-pipeline-safety.mjs` 가 재발 방지 스캔):
   - `node scripts/guard-staging-target.mjs` — 링크된 프로젝트가 정확히 staging 일 때만 통과
   - `node scripts/guard-production-target.mjs` — 정확히 production 일 때만 통과(읽기 전용 점검용; 쓰기는 별도 명시 승인)
3. `supabase db push --linked --dry-run` 으로 대상 목록을 먼저 본다. production 쓰기는 Gate 문서(§9)를 따른다.
4. `supabase db query --linked --file X.sql` 로 파일 단위 실행(인라인 SQL 은 불안정). 링크 전환 후엔 `supabase/.temp/project-ref` 를 확인한다.
5. **production 정리(DROP) 후보는 `supabase/pending-cleanup/` 에 둔다**(migrations 밖). 관리자 계정 준비 + Gate 승인 후에만 옮겨 적용한다.

## 4. 인증/권한 구조

### 학생 (일반 사용자) — opaque session token
- 로그인: `student_check_login` / `student_register` RPC(SECURITY DEFINER) → 서버가 `encode(gen_random_bytes(32),'hex')` 토큰 발급, **DB에는 SHA-256 해시만** 저장(`student_sessions`), 원문 토큰은 응답 1회.
- 30일 슬라이딩 만료, `student_logout` 으로 폐기. `students` 테이블은 anon 이 `student_id, name` 만 읽을 수 있고 `birth_date`(=사실상 비밀번호)는 읽을 수 없다.
- 신원이 필요한 모든 쓰기는 RPC 가 `_resolve_student_session(token)` 으로 **서버가** 신원을 확정한다(client 가 보낸 student_id/이름은 신뢰하지 않음): 폐기/정보수정/위치이동 신청, 시약·Lot 등록, Lot 추가, 정보확인, 재고실사 임시저장·신규등록, 구매요청서 제출(로그인 시).

### 관리자 — Supabase Auth 만
- **관리자 = Supabase Auth 사용자 + `admin_users`(active) → `public.is_admin()`**. 이것이 DB 가 강제하는 유일한 관리자 권한이다.
- 프론트 `isAdmin` 도 같은 근거(`useAdminSession`)다. 학생 계정의 `students.is_admin` / 공유 PIN 승격 / `student_admin_*` RPC 는 **폐기**(20260920110000). 컬럼·`app_settings.admin_password` 행은 데이터 보존을 위해 남겼지만 어떤 코드/권한도 참조하지 않는다.
- 관리자 write 는 `supabaseAdmin` 클라이언트(별도 storageKey `lm_admin_auth`)로만: (a) RLS `is_admin()` 정책 테이블 직접 쓰기, (b) 요청 승인/반려·재고실사·재고 조정 등 **SECURITY DEFINER RPC**(승인자는 `auth.uid()` 로 서버가 확정, 변경 내용은 DB 의 요청 행을 서버가 다시 읽음).

### 테이블별 최종 권한 (20260920100000 + 후속)
- **읽기 공개 / 쓰기 관리자(RLS is_admin)**: lab_rules, safety_briefings, notices, notice_files, calendar_events*, label_*·signage_master·school_chemical_master·regulation_document*·special_material_logs·items·item_lots·item_locations·locations·receipts*, purchase_requests(update/delete), reagents/reagent_lots(insert/update). (*정리 후보)
- **RPC 전용(클라이언트 SELECT 만)**: 요청 3종(disposal/reagent_change/location), purchase_request_logs·items, inventory_sessions/counts/assignments, stock_logs, location_history.
- **관리자 전용 읽기/쓰기**: admin_logs, reagent_import_history.
- **예외**: fcm_tokens(기기 토큰 등록은 비로그인도 — 삭제만 관리자), hazard_ledger_notes(누구나 편집하던 문서 준비 메모 — 업무 결정 대기), app_settings(쓰기 관리자, `admin_password` 키 불가).
- TRUNCATE/REFERENCES/TRIGGER 는 anon/authenticated 에서 전부 회수. Storage `documents` 버킷: 읽기 공개, 쓰기/수정/삭제 관리자만.
- 검증: `scripts/staging/test-acl-matrix.mjs` (anon / 일반 Auth / 관리자 JWT 3종으로 테이블·연산별 실측).

## 5. 재고실사 workflow (서버가 강제)
1. 학생 입력 → `inventory_count_save` RPC → `inventory_counts` 임시저장 (**장부 불변**, 진행 중(active) 세션에서만 저장)
2. 학생 Lot [완료] → 시약목록에 실사값이 **미확정(파란 셀 배경)** 으로 표시(장부 여전히 불변; 표시용 오버레이)
3. 관리자 [실사 완료] → `inventory_session_transition('review')` → status `reviewed` (입력 잠김, 장부 불변, 목록엔 계속 미확정 표시). `reopen` 으로 되돌릴 수 있음
4. 관리자 [DB 최종 반영] → `inventory_session_finalize` **단일 트랜잭션**: reagents/reagent_lots 반영 + stock_logs/location_history/reagent_change_requests 이력 생성 + status `completed`. 실패 시 전부 롤백, 동시 호출은 한 번만 성공
- 실사 중 발견한 **신규 등록**만 예외적으로 즉시 행이 생기지만 `pending_confirm=true`(미확정)이며 ④에서 확정, 취소 시 서버가 삭제.
- `inventory_assignments`(구역 담당 배정)는 코드에서 쓰이지 않는 기능이라 학생 접근 범위는 "로그인 학생 + active 세션"으로 검증.
- 검증: `scripts/staging/test-inventory-workflow.mjs`.

## 6. 재고 동기화(inventory snapshot) — 현재 상태
- 백엔드(`sync_inventory_snapshot` RPC, migration 20260914090000)는 **production 설치 완료**, 데이터 변경 0.
- **P2(최초 실호출)는 보류**: production 앱 관리자 Auth 계정이 아직 없어서. **프론트 Apply 버튼은 하드 비활성**이며 활성화 금지(관리자 계정 + Gate 후).
- staging 36 시나리오 회귀: `scripts/staging/test-inventory-snapshot-rpc.mjs`.

## 7. 내부관리번호 (KNU-YYYYMMDD-NNN)
서버 원자 카운터(`internal_lot_counters`) + 유일 인덱스(`reagent_lots_generated_lot_no_key`)로 중앙 생성(한국시간 날짜). 학생 화면은 등록 RPC 안에서, 관리자 화면은 `admin_next_internal_lot_nos` 로 번호를 받는다. 재고 동기화 RPC 는 기존 max+1 방식을 유지하지만 유일 인덱스가 중복을 막는다(동시 실행 시 한쪽 실패 → 재시도). 검증: `scripts/staging/test-reagent-domain.mjs`.

## 8. 백업 / 사고 대응 / 롤백
- 데이터 백업 도구: `scripts/backup-before-rebuild.mjs`(재구축 전), `scripts/production-inventory-backup.mjs`(재고 동기화 전 Excel 백업). 프론트 "현재 재고 백업 다운로드" 버튼도 있다.
- production 은 읽기 점검 도구(`scripts/production-*.sql`, `scripts/production/*.mjs`)로만 상태를 본다. 쓰기 전에는 항상 백업 + dry-run + guard.
- 롤백: 마이그레이션은 forward-only 로 작성한다. 잘못된 적용은 (1) 새 마이그레이션으로 되돌리거나 (2) 백업 Excel/스냅샷에서 복원. RPC 는 트랜잭션이라 도중 실패 시 자동 롤백.
- 사고 시 우선순위: 쓰기 중단 → 어떤 프로젝트에 링크돼 있는지 확인(`cat supabase/.temp/project-ref`) → 백업 위치 확인 → 사용자에게 보고.

## 9. Production Gate (관리자 계정 이후) 실행 순서
`docs/PRODUCTION_GATE_RUNBOOK.md` 참고.

## 10. 학교 공용 Supabase 이전
최종 단계에서 Organization 이전으로 처리(지금은 하지 않음). 체크리스트는 `docs/PRODUCTION_GATE_RUNBOOK.md` 하단.

## 11. 기술부채: baseline migration
현재 `supabase/migrations` 만으로는 **빈 DB 를 완전히 재구성할 수 없다**(초기 테이블 다수가 대시보드에서 수기로 생성됨 — `README_v2.md` 참고). 스키마가 확정되는 최종 단계에서 `pg_dump` 기반 baseline 을 별도 작업으로 만든다(이번 작업 중 schema 가 계속 바뀌므로 성급히 만들지 않음). staging fixture(`scripts/staging/*-fixture-schema.sql`)는 RPC/ACL 검증에 필요한 **최소 모양**일 뿐 baseline 이 아니다.

## 12. 테스트 도구 요약
| 무엇 | 어디 | 실행 |
|---|---|---|
| DB 회귀(auth 14 / session 11 / batch1 12 / review 28 / inventory-workflow 18 / reagent-domain 14 / ACL 35 / snapshot 36) | `scripts/staging/` | fixture 재적용 후 각 `test-*.mjs` (service key 는 환경변수) |
| UI(reagent list 24 / 라우트 / Excel 4 / 모달 / 느린 네트워크 / a11y·모바일 감사) | `scripts/ui/` | `node scripts/ui/serve-mock.mjs` 후 `node scripts/ui/test-*.mjs` (가짜 Supabase — 실제 연결 없음) |
