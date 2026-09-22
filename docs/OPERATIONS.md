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

## 4-1. 요청 3종(위치 변경 / 시약정보 수정 / 폐기) — 한 가지 의미
- 학생 신청: `location_request_submit` / `reagent_change_request_submit` / `disposal_request_submit`(세션 토큰) → status `pending`, **실제 master/Lot 불변**. 성공 문구: "위치 변경 / 시약정보 수정 / 폐기 신청이 완료되었습니다."
- 관리자 처리: `location_request_review` / `reagent_change_request_review` / `disposal_request_review`(Supabase Auth 관리자). 승인 = 실제 반영 + 이력(한 트랜잭션), 반려 = 실제 변화 0 + 반려 사유(`review_note`) 기록.
- **폐기: 승인 = 즉시 폐기 완료**(`disposed`). 별도 "폐기 완료" 2단계는 없고 review RPC 액션은 `approve`/`reject` 둘뿐. 홈·관리자 폐기 관리·시약 상세가 모두 이 RPC 하나를 쓴다. Lot 폐기 방식: 신청 수량이 정수 n 이고 미개봉 병이 n보다 많이(>1) 있으면 n병만 차감(Lot 유지), 그 외엔 Lot 전체 폐기.
- 중복 규칙(서버 + 유일 인덱스): 같은 Lot 의 pending 폐기 1개 · 같은 Lot 의 pending 위치변경 1개 · 같은 시약·항목의 pending 수정 1개. 과거 처리 완료/반려 행은 새 신청을 막지 않는다. **종류 간(위치 vs 폐기 등) 교차 제한은 두지 않았다**(업무 규칙 미정) — 한쪽이 먼저 승인되면 다른 쪽은 안전하게 실패(폐기된 Lot 은 이동 불가)하고 관리자가 반려한다.
- 화면 문구는 `src/lib/requestStatus.js` 한 곳(학생: "…신청 완료 · 관리자 검토 대기", 관리자: "… 요청 대기", 승인 후: "위치 변경 완료 / 시약정보 수정 완료 / 폐기 완료", 반려: "… 반려").
- 검증: `scripts/staging/test-request-unification.mjs`(14), `scripts/ui/test-detail-requests.mjs`(98).

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

## 관리자 권한 점검 결과 (2026-09-20)
- 관리자 판별: Supabase Auth 로그인 + `admin_users(active)` → DB `public.is_admin()`. 프론트는 `useAdminSession`(Layout 이 1회 판정해 Context 로 공유, 조회 실패/시간초과(5s) = 관리자 아님)로 **노출만** 제어하고, 실제 권한은 DB(RLS/RPC)가 결정한다.
- production 은 `resource_files`/`sync_inventory_snapshot`/`set_resource_current` 만 DB 보호. 나머지 관리자 쓰기 보호는 대기 중인 9개 마이그레이션 적용(`docs/PRODUCTION_GATE_RUNBOOK.md` B~C) 후 완성된다.
- 읽기 전용 감사: `scripts/production-admin-audit.sql`. 프론트 게이트 검증: `scripts/ui/test-admin-gate.mjs`.

## 병 단위 요청 (2026-09-23, staging 전용)
- 데이터 모델: reagent_lots 1행 = 병 1개. lot_no 는 제조사 배치 번호(같은 시약에 같은 lot_no 여러 행이 실제로 존재 — production 실측 58그룹)이므로 병 식별키가 아니다. production 실측: sealed_count 는 0/1 뿐(>1 행 0건).
- 폐기/위치 이동 요청은 lot_id 필수, 제출 RPC 는 병 행에서 시약/Lot/기존 위치를 서버가 확정. 폐기 수량 개념 제거(승인 = 그 병 1개 즉시 폐기). 승인 직전 재검증(상태/시약 일치/현재 위치=요청 시점 위치).
- migration: 20260923090000_bottle_unit_requests.sql (production 미적용, Gate 런북 10번째). 테스트: scripts/staging/test-bottle-unit.mjs, scripts/ui/test-bottle-admin-review.mjs.

## 시약 검색 자동추천 통일 (2026-09-23)
- 정본: `src/components/ReagentSearchInput.jsx`(combobox) + `src/hooks/useReagentAutocomplete.js` + `src/lib/reagentSearch.js`(검색 규칙·공용 시약 인덱스). 영문명/국문명/CAS 검색, 최대 10개, 빈 입력은 추천 숨김, 추천창은 body 포털 + viewport 충돌 처리(모달/표에 잘리지 않음), ARIA combobox/listbox/option.
- 데이터: 시약 인덱스(id/이름/국문명/CAS/제조사/분류/순도/용량)를 앱 전체에서 1회만 로드해 메모리에서 검색(키 입력마다 서버 조회 없음, 5분 TTL, 등록 시 invalidate). 재고실사는 `items`(이번 실사 배정 Lot)로 범위를 제한 — 추천이 권한 범위를 넓히지 않는다.
- 자유 입력 유지: 구매요청서 물품명(free text)·시약 등록 새 이름·BulkLookup(여러 줄 붙여넣기)·공지/안전 제목 검색은 시약 선택이 아니므로 강제하지 않음. 테스트: scripts/ui/test-reagent-search-input.mjs.


## 시약 UI 일관성 · 일괄검색 필터 (2026-09-24, frontend 전용)
- **시약 일괄정리**(`BulkEditTab`): "시약을 찾는 경험"은 시약목록과 같은 컴포넌트를 쓴다 — `ReagentSearchBar`(검색창+검색 버튼), `LocationFilter`(실험실 탭/세부위치, 선택 즉시 적용 — 예전 "필터 적용" 버튼은 select 값을 다시 조회에 반영하던 역할뿐이라 제거), `ResultSummary/ListState`, `AlphabetIndex`/`AlphabetSheet`(A–Z, `lib/reagentLetters` 정렬·그룹 기준 = 시약목록과 동일: sort_letter 우선 → 영문명 순). 일괄정리 전용은 체크박스·선택된 Lot 수·위치 이동/폐기뿐. 병 행은 "병 i/N · Lot No. · 위치 · 개봉/미개봉 · 잔량"을 항상 보이고 병 identity 는 `reagent_lots.id`(tooltip/짧은 ID). 필터를 바꿔도 선택은 유지되며 현재 목록 밖 선택 수를 안내한다.
- **제조사 로고 팝업**(`CompanyPicker`): body 포털 + `lib/popoverPlacement`(자동추천과 공용) viewport 충돌 처리, 로고 버튼 44px. 예전엔 입력칸 안쪽 absolute(300px)라 모달의 overflow 영역/화면 오른쪽에서 잘렸다.
- **시약 일괄검색 = 시약목록에 거는 다중 검색 필터**: 별도 결과표 없음. `📋 시약 일괄 검색` 모달(입력 전용) → [조회] → 공통 검색 규칙(`lib/reagentMatch.js`, 영문명/국문명/CAS·하이픈 없는 CAS)으로 메모리의 시약 인덱스에 대조 → 시약 id 집합을 다른 필터와 AND 로 적용. 여러 줄 = OR, 시약 id 로 중복 제거, 한 줄이 여러 시약에 걸리면 모두 표시(후보 선택 없음). 원문이 아무것도 못 찾을 때만 "이름(약어)"의 괄호 대체 검색어(앞 본문 → 괄호 안 3자 이상)를 시도 — 자동추천·목록 Enter 검색도 같은 fallback. 입력 줄마다 DB 를 조회하지 않는다(1,000줄 상한, 2,000 시약×1,000줄 ≈ 0.2s). 상태: URL 은 `bs=1` 표시만, 입력·결과는 sessionStorage(상세→뒤로/새로고침 유지, 새 세션 X). 요약 줄: 입력 N · 일치 시약 M · Lot 표시 · 미확인 U(=공통 규칙으로 못 찾음, "연구실에 없음"이 아님).
- 과거 0/35 원인: 옛 일괄검색은 `name`(영문명) 컬럼만 `ilike`로 비교(국문명·CAS 미사용, 공통 normalize 미사용)했고 괄호는 공백으로 바꾼 뒤 클라이언트에서 원문 `includes` 로 다시 걸렀다 → 국문/CAS/괄호 입력은 항상 "없음".
- 테스트: `node scripts/test-reagent-match.mjs`(29), UI `test-company-picker.mjs`, `test-batch-search.mjs` (당시의 `test-bulk-edit-ux.mjs`는 시약 일괄정리 폐지와 함께 2026-09-22에 삭제 — 아래 "시약 통합 액션 허브" 참고).

## 시약 상세/목록 UX 통합 (2026-09-24, frontend 전용)
- **Breadcrumb**(`design.jsx` `Breadcrumb`/`PageBanner`): 실제 라우트 계층만 표시. 항상 "홈"(/)으로 시작하므로 페이지는 `breadcrumb`에 '홈'을 넣지 않는다(옛 "홈 › 홈"·없는 "시약 관리" 단계 제거). 항목 = 문자열(링크 없음) | `{ label, to, onClick }`; 마지막 = 현재 페이지(`aria-current="page"`). `<nav aria-label="현재 위치">`.
- **상세 ← 시약 목록**: `PageBanner back` — 제목 위에 항상 보이는 버튼(접근성 이름 "시약 목록으로 돌아가기") + breadcrumb 의 "시약 목록" 링크가 같은 `goToList`를 쓴다: 목록에서 들어왔으면(`location.state.from==='list'`) `navigate(-1)` → 검색·필터·일괄검색·스크롤 복원, 직접 URL 이면 `/reagents/list`.
- **상세 action**: 자주 쓰는 것은 밖에 — `📦 새 Lot 추가`(예전 "재고 등록": 실제로는 현재 시약에 새 reagent_lots 행을 추가), `📍 위치 변경(신청)`, `✏️ 정보 수정(신청)`, (실사 중) 정보 맞음. `⋯ 더보기`(role=menu, 키보드/Esc, 화면 안 fixed 위치)에는 폐기(처리/신청)·시약 종류 삭제(관리자)만. 정보 수정은 편집 모드에서 **취소 / 저장(관리자) · 수정 신청(학생)** — 바꾼 항목만 전송(관리자: 1회 update, 학생: 항목별 `reagent_change_request_submit`). 권한/RPC 의미는 그대로.
- **기본정보 vs Lot 분리**: 「시약 기본정보」(reagent 단위, 모든 병 공통)와 「보유 Lot / 병」(병 1개 = reagent_lots 1행, `병 i/N`, 병별 위치 변경/폐기 버튼, 병 ID tooltip).
  | 구분 | 항목 |
  |---|---|
  | reagent 편집 가능(관리자 직접 / 학생 신청) | 국문명, CAS, 제조사, 순도, 성상, 용량(숫자)+단위(별도), 유해정보 |
  | reagent 읽기 전용(화면에서 미노출) | 영문명(정렬·묶음 기준), manager, msds_url(관리자 파일 업로드), notes |
  | Lot 편집 가능(관리자만, RPC) | 미개봉 병 수·잔량(admin_lot_update: sealed_count/current_stock만), 상태(사용완료/분실: admin_lot_set_status) |
  | Lot 요청 전용(학생 신청 → 관리자 승인, 관리자는 직접) | 위치 변경, 폐기 |
  | 읽기 전용/계산 | Lot No.·Cat No.·입고/개봉/유효기간(생성 후 변경 RPC 없음), 최종확인일/등록자, GHS·유해분류·위험물유별·특별관리물질(자동/계산), CAS 검증, 재고 부족 |
- **목록 grouping / badge 의미**: 목록의 한 행 = reagent master 1건(reagents.id). 이름(trim·소문자)이 같은 master 가 같은 A–Z 구간에 여러 개면 그룹 헤더로 묶는다(제조사·순도·CAS 가 달라도 병합은 안 함, DB 병합 없음). 예전 "N개 제품" = 그 그룹의 reagent master 수, 예전 "N병" = 그 master 의 보유중(active) Lot 행 수(단, master 의 전체 Lot 행이 2개 이상일 때만 표시). 지금은 `보유 N병 · N개 위치`(중립 회색, 병 수는 lib/lotSummary: 묶음 행은 미개봉 병 수만큼), `제조사 N곳`(중립), `재고 부족`(경고 빨강: 미개봉 0 + 개봉 병 잔량 ≤ 20% 인 병이 있음), `검토대기`(파랑), `미확인 보고`(노랑). 펼치기는 배지가 아니라 별도 `▸` 버튼(aria-expanded).
- 관리자 정보 수정 버그 수정: CAS 저장 시 존재하지 않는 `cas_no_source` 컬럼을 보내 실패했다 → 실제 컬럼 `cas_source`. 용량은 numeric 컬럼인데 "500 mL" 통째로 저장하려던 것 → 용량/단위 분리.
- 테스트: `scripts/ui/test-reagent-ux-consolidation.mjs`(breadcrumb, 상세 뒤로/직접 URL, action 구조, 정보 수정, badge, 7개 viewport).

## staging 실제 브라우저 QA (2026-09-24, scripts/qa/)
- **목적/원칙**: mock 이 아닌 실제 staging frontend + 실제 staging Supabase 를 브라우저로 조작. production 접속 금지 — `.env.local` 에 production ref/Firebase 값이 있으므로 dev 서버는 반드시 `node scripts/qa/serve-staging.mjs`(env 를 staging 으로 명시 덮어씀, Firebase 비활성 더미, 포트 5299)로 띄우고, QA 브라우저 세션은 production ref/Firebase 로 향하는 요청을 차단·집계한다(정상 = 0).
- **데이터**: `bash scripts/staging/run-with-key.sh scripts/qa/qa-staging-data.mjs seed|clean` (QA_STATE_FILE 환경변수=저장소 밖 경로). 시약 notes='QA-BROWSER-…', 위치 'QA-…', QA 학생/관리자 계정을 만들고 clean 이 전부 삭제한다(시약→Lot cascade, 요청/이력/로그/계정 포함). `qa-count.mjs` 로 전/후 행 수 확인.
- **스위트**: qa-a-list(목록/검색/A–Z/필터), qa-b-batch(일괄검색), qa-c-detail(상세 진입·복귀·직접 URL·새 Lot·학생 요청), qa-d-admin(관리자 정보 수정/요청 반려), qa-e-ui(badge·그룹·제조사 선택·BulkEdit·breadcrumb·모바일), qa-f-network(느린 API·30초 시간 초과·중복 제출·새로고침·요청 감사), qa-notice.
- **QA 로 발견·수정한 것**: 목록 Enter 검색이 하이픈 없는 CAS(64197)·괄호가 든 실제 화학명(Iron(III) chloride)을 못 찾음(서버 or() 필터가 값을 공백 치환) → 값 큰따옴표 + CAS 재표기; 상세가 관리자 전용 테이블 reagent_import_history 를 모두에게 조회해 401(관리자에게도: anon 클라이언트) → 관리자만 supabaseAdmin; 요청이 멈추면 postgrest-js 자동 재시도로 ≈2분간 로더 → 시간 초과는 재시도 제외(code=ABORT_ERR), 목록/상세에 오류 문구+다시 시도(예전엔 "조건에 맞는 시약이 없습니다"/"시약을 찾을 수 없습니다"로 오해); 제조사 팝업 키보드(↓/방향키/Esc, 선택 후 포커스 복귀·재오픈 방지); breadcrumb 터치 타깃 44px(레이아웃 높이 유지); 상세 Lot 카드 React 스타일 경고(padding/paddingBottom); 공지 상세 prev/next .single() 406 → maybeSingle; 모바일 카드 줄바꿈; 일괄검색 요약의 로딩 중 "0 Lot" 깜빡임.
## 묶음 행 가드 / 사용중·여분 판정 / 백업·복원 (2026-09-23, staging 전용)
- **묶음 행 가드**: reagent_lots 1행 = 병 1개가 전제. `sealed_count > 1` 행은 병 단위 작업(폐기·위치 이동 신청/승인, 일괄 이동·폐기, 개별 이동, 사용완료·분실 표시)을 서버가 fail-closed 로 거부한다: "여러 병이 하나의 Lot 행에 묶여 있어 병 단위 작업을 할 수 없습니다. 병별 Lot 행으로 분리 후 처리해주세요." 수량 수정(admin_lot_update)은 분리 경로라 막지 않는다. production 실측 sealed_count > 1 = 0건(재검증 2026-09-20). 화면에서도 선택 불가로 표시한다.
- **사용중/여분**(DB 저장 없음, 재배치 작업표에서 계산): 같은 시약 활성 병 중 잔량 최소 = 사용중(미개봉=100%, 후보 중 개봉 병 우선), 나머지 = 여분. 그래도 동률이면 "현장 확인 필요" — 입고일·병 ID 는 판정에 쓰지 않는다(표시/정렬 전용). 관리자가 병별 역할을 직접 지정 가능. 현장 확인 필요가 있으면 집계는 "잠정값"으로 UI/Excel 에 표시.
- **schema parity**: staging 은 픽스처로 만든 스키마라 production 과 달랐다(FK 누락 등). `scripts/schema-fingerprint.sql`(읽기 전용)로 production/staging 을 뽑아 `scripts/schema-diff.mjs` 로 비교하고, `scripts/gen-scope-baseline.mjs` 가 production 스키마에서 복원 범위 16개 테이블의 baseline DDL(`scripts/staging/production-baseline-scope.sql`)을 생성한다. 재현: `bash scripts/staging/reset-and-run-all.sh` (픽스처 → baseline → 시드 → migration 전부 → 회귀 전체). baseline 위에 migration 을 적용한 staging 은 production 의 "migration 적용 후" 스키마와 같다(남는 차이 = migration 이 추가하는 review_note/부분 유일 인덱스/RLS 뿐).
- **백업/복원 v2 (두 모드)**: 관리자 > 백업/복원. 화면이 두 카드로 나뉜다.
  - **모드 A "핵심 시약·재고 백업"** (16개): students, locations, reagents, reagent_lots, location_history, location_requests, disposal_requests, reagent_change_requests, stock_history, stock_logs, reagent_import_history, special_material_logs, inventory_sessions, inventory_assignments, inventory_counts, admin_logs. Storage 파일 없음.
  - **모드 B "전체 시스템 백업"** (24개) = 핵심 16 + 구매요청 4(purchase_requests[관리자 화면에 보이는 레거시], purchase_request_logs, purchase_request_reagent_items, purchase_request_goods_items) + notices + notice_files + resource_files + app_settings(**허용 목록 키만**: lab_name, lab_professor, lab_assistant, lab_phone, safety_dept_phone, emergency_contact, school_safety_system_url, kosha_label_url, quick_links) + **Storage 실제 파일**(documents 버킷에서 notice_files/notices.file_url/resource_files/reagents.msds_url 이 가리키는 객체).
  - **제외(두 모드 공통)**: Supabase Auth 사용자, admin_users(복원 후 실제 Auth 관리자를 다시 등록), student_sessions, fcm_tokens, school_chemical_master(기본 제외; "참조 데이터 포함" 옵션은 설계만), app_settings 의 admin_password/super_password/토큰/API 키/restore_enabled 등 허용 목록 밖 전부(백업에 아예 안 실리고, 복원 payload 에 있으면 dry-run 거부).
  - **ZIP 형식**: `manifest.json`(backup_mode, backup_version, created_at, app_version, schema_version, table_counts, table_digests, storage.objects[{bucket,path,size,sha256,content_type,refs}]) + `tables/*.json` + `storage/<bucket>/<path>`. Excel(조회용)은 복원에 쓰지 않으며 전체 모드에는 "Storage 파일" 시트가 추가된다. 학생 생년월일이 들어 있으므로 ZIP 은 안전하게 보관(두 카드 모두 경고 표시).
  - **복원 = 빈 대상 전용, 두 모드만**(병합/덮어쓰기 복원 없음). 모드는 ZIP manifest 로 결정되고 화면에 배지로 표시. 서버 RPC `admin_restore_full` 은 한 DB 트랜잭션: manifest/스키마 → 빈 대상 → PK 중복 → FK 고아(구매요청·공지/notice_files·resource_files 포함) → app_settings 허용 목록/충돌 → 삽입 → 행 수/digest → 시퀀스 보정. dry-run 은 항상 롤백(쓰기 0).
  - **Storage 원자성 한계(중요)**: DB 트랜잭션과 Storage 는 별개 시스템이라 **하나의 트랜잭션이 아니다**. 안전 순서 = ① dry-run(DB + Storage 충돌/누락/sha256/경로 traversal/중복/manifest 밖 객체 검증, 쓰기 0) → ② Storage 업로드(upsert:false, 덮어쓰기 없음; 기존 객체가 있으면 dry-run 실패) → ③ 재다운로드 sha256 검증 → ④ DB 복원 트랜잭션. ②~④ 중 실패하면 **이번 복원이 올린 객체만** 삭제(정리 실패 시 남은 경로를 화면에 표시 + journal 유지). 복원 도중 브라우저가 죽으면 "중단된 복원 정리" 버튼(DB 가 비어 있고 sha256 이 같은 객체만 삭제; DB 에 행이 있으면 거부).
  - 실행은 app_settings.restore_enabled='true' + p_confirm='RESTORE' 필요(기본 비활성 = production; migration 이 이 값을 만들지 않는다). 복원 전 같은 모드의 현재 상태 백업 내려받기를 UI 가 강제. 다른 프로젝트로 복원하면 Storage URL 을 대상 프로젝트로 재작성하고 digest 는 재작성된 행 기준으로 검증.
  - Storage 키는 ASCII 안전 문자만 허용(Supabase Storage 가 한글/이모지 키를 'Invalid key' 로 거부) — 그런 경로가 ZIP 에 있으면 dry-run 이 미리 거부한다.
  - 리허설: `scripts/staging/test-backup-restore.mjs`(핵심 22) + `test-backup-restore-full.mjs`(전체 29)는 `reset-and-run-all.sh` 의 **마지막**에 실행(범위 테이블을 비우고 합성 데이터로 채우므로). UI: `scripts/ui/test-backup-restore-tab.mjs`.

## 시약 통합 액션 허브 — 시약 일괄정리 폐지 (2026-09-22, frontend 전용)
- **시약 일괄정리 페이지는 없어졌다.** "시약 목록" 하나가 시약 관련 모든 작업의 단일 허브다. 체크박스는 언제나 "이 시약(reagent 종류, `reagents.id`)을 작업 대상으로 선택"만 의미하고, 무엇에 쓸지는 선택 뒤 액션바에서 고른다("N종 선택됨" — 별도 "일괄 작업 모드" 없음, 1종 선택=단일 작업·여러 종 선택=자연히 일괄 작업).
- **액션바**(`components/reagents/actions/SelectedReagentActionBar.jsx`): 구매요청 / 위치 이동(신청) / 폐기(신청) / 정보 수정(신청) / 선택 목록 보기 / Excel 내보내기 / 선택 해제. 데스크톱은 가로 바, 모바일은 "작업 선택" 버튼 → bottom sheet. 필터를 바꿔도 선택은 유지되고, 현재 필터 밖으로 숨은 선택 수를 안내한다("N종 선택됨 · 현재 필터에서 M종 숨김").
- **위치 이동/폐기 = 2단계**(`components/reagents/actions/LotSelectionDialog.jsx`): 시약 체크만으로 그 시약의 모든 병이 자동으로 대상이 되지 않는다. 선택한 시약들의 실제 보유 병(`reagent_lots.id`)을 다시 보여주고 명시적으로 체크해야 한다(기본 전부 미선택). 같은 Lot No.라도 병은 독립적으로 선택되고, `sealed_count > 1`(묶음 행)은 옛 시약 일괄정리와 같은 이유로 선택 불가(fail-closed, 서버도 거부). 실제 제출(관리자 직접 반영 또는 학생 신청)은 옛 시약 일괄정리가 쓰던 `adminMoveLots`/`adminDisposeLots`/`location_request_submit`/`disposal_request_submit`을 그대로 재사용 — RPC/권한 semantics 변경 없음.
- **구매요청**: 옛 로직 그대로(reagent-level `prefillReagentItems`, Lot 선택 없음) — 액션바에서 바로 `/purchase-request`로 이동.
- **정보 수정**: 1종 선택 시 시약 상세페이지로 이동해 그 화면의 기존 편집 폼이 자동으로 열린다(`location.state.autoEdit`) — 별도 편집기를 새로 만들지 않음. 여러 종 선택 시 `components/reagents/actions/MultiReagentEditQueue.jsx`가 시약마다 같은 폼을 순차로 보여주고 각각 따로 저장/신청한다(여러 시약에 같은 값을 한 번에 잘못 덮어쓰는 사고를 막기 위해 새 bulk-update RPC를 만들지 않음). 필드 목록/저장 규칙은 `lib/reagentMasterFields.js` + `lib/reagentMasterEdit.js`로 뽑아 상세페이지와 큐가 공유하고, 렌더링은 `components/reagents/ReagentMasterFieldsGrid.jsx`를 공유한다.
- **Excel**: "선택 항목 Excel"(액션바, `exportPickedReagents`)과 "현재 목록 Excel"(툴바, `exportReagents`, 필터링된 전체 목록)은 서로 다른 별개 기능으로 공존 — 통합하면서 지우지 않았다.
- **호환**: `/reagents/bulk-edit`는 `/reagents/list`로 즉시 redirect만 하고(옛 즐겨찾기/링크 보존), 사이드바 "시약 일괄정리" 메뉴는 제거됐다.
- **Dead-code 감사 증거표** (import/route/runtime/test 전수 확인 후 결정):

  | File | imports | routes | runtime use | test/script use | decision |
  |---|---|---|---|---|---|
  | `src/pages/BulkEdit.jsx` | 0 (App.jsx의 import 제거) | route가 redirect로 교체 | 0 | 커버리지 이전됨 | DELETE (`git rm`) |
  | `src/components/admin/BulkEditTab.jsx` | 0 | 0 | 0 | 커버리지 이전됨 | DELETE (`git rm`) |
  | `src/lib/reagentSearch.js`의 `compareReagentNames` | 0(정의부 제외) | — | 0 | 0 | DELETE(export 제거, 파일 자체는 다른 export 때문에 유지) |
  | `BulkMoveModal.jsx` / `BulkDisposalModal.jsx` | `LotSelectionDialog.jsx`에서 사용 | — | 있음(신청/승인 폼) | `test-reagent-unified-actions.mjs` | KEEP |
  | `adminMoveLots` / `adminDisposeLots`(`lib/adminReview.js`) | `LotSelectionDialog.jsx`, `ReagentDetail.jsx` | — | 있음 | 다수 | KEEP |
  | `LocationFilter.jsx` | `ReagentFilters.jsx`에서 사용 | — | 있음 | 다수 | KEEP |
  | `AlphabetIndex.jsx`/`AlphabetSheet.jsx`/`groupByLetter`/`rankFields` | `ReagentTable`/`MobileReagentList`/`reagentMatch.js` 내부 | — | 있음(시약목록 A–Z/자동추천) | 다수 | KEEP |
  | `src/components/resources/ResourceReagentList.jsx` | `Resources.jsx` | `/resources` (특별관리물질 > 대상물질 섹션) | 있음 | `test-reagent-unified-actions.mjs`에 생존 확인 재수록 | KEEP — 과거 오판(dead 취급) 사례가 있어 이번에도 명시적으로 재확인 |
  | `src/ReagentList.jsx`,`ReagentLocations.jsx`,`Items.jsx`,`pages/Reagents.jsx`,`ItemDetail.jsx`,`pages/Requests.jsx`,`pages/Calendar.jsx` | — | — | — | — | 최신 local HEAD에 이미 없음(재작성 안 함) |

- **테스트**: `scripts/ui/test-reagent-unified-actions.mjs`(선택 semantics·액션바·2단계 Lot 선택·묶음 행 가드·같은 Lot No. 독립·구매요청·정보수정 단일/큐·Excel·redirect). 옛 `test-bulk-edit-ux.mjs`는 삭제(검색/자동완성/CAS 회귀는 `test-reagent-search-input.mjs`·`test-reagent-list.mjs`가 이미 커버하던 것이라 중복). `test-grouped-guard-ui.mjs`는 상세페이지 단일-병 가드만 남기고 시약 일괄정리 전용 구간 제거. `test-reagent-ux-consolidation.mjs`의 breadcrumb 표에서 `/reagents/bulk-edit` 항목을 redirect 확인으로 교체.
- **알려진 후속 과제**: staging 전용 QA 스크립트(`scripts/qa/qa-e-ui.mjs`, `qa-f-network.mjs`)는 아직 `/reagents/bulk-edit`를 직접 열도록 되어 있어 다음 staging 실브라우저 QA 때 새 흐름(선택 → 액션바 → LotSelectionDialog)에 맞춰 다시 손봐야 한다 — 이번 Phase는 frontend 아키텍처/mock 회귀 범위만 다뤘다. (`scripts/ui/audit-a11y-mobile.mjs`는 자료 단순화 Phase에서 bulk-edit 항목을 이미 정리함 — 아래 참고.)

## 자료(Resources) 단순화 — 읽기 전용 안내·서식 자료실로 축소 (2026-09-22, frontend 전용)
- **역할 분리 확정**: 시약 목록=시약 데이터 조회/검색/필터/선택/내보내기(변경 없음), 재고실사=실사 workflow(변경 없음), 공지사항=게시판(`/notices`, Home 화면에 이미 독립 메뉴로 있어 그대로 둠), 자료(`/resources`)=짧은 행동지침·규칙 + 첨부파일만 보는 읽기 전용 자료실. 자료 탭 안에서 시약 DB를 다시 조회/집계하거나 Excel을 만드는 업무 도구 기능은 원칙적으로 제거했다.
- **정보구조**: 예전엔 1차 카테고리(6개, 공지사항 포함) → PillNav(섹션) → 섹션 상세(임베드/누가·언제 배지/액션 버튼 목록) → 첨부파일의 3~4단계 중첩 구조였다. 지금은 카테고리 필터 칩(전체/안전·폐기/서식·양식/연구실 운영, `RESOURCE_GROUPS`) 하나만 있는 **한 세로 목록**(`ResourceCard.jsx` × 30개)으로 바뀌었다. 필터 칩은 화면 표시 전용 묶음(`CATEGORY_GROUP`: waste·special·signage→안전·폐기, prior→서식·양식, ops→연구실 운영)이고, 각 카드의 실제 `category_key`/`section_key`는 `resourceGuides.js`의 원래 키 그대로라 `resource_files`가 orphan되지 않는다.
- **카드 하나의 구성**(`ResourceCard.jsx`, `ResourceGuidePage.jsx` 대체): 제목 + 카테고리 라벨 + 요약 1~2문장 + 핵심 행동(steps, 있는 그대로 유지) + 주의사항(notice, 있는 그대로 유지) + 링크 최대 3개(시약 목록 열기/앱 내 다른 도구/공식 사이트, `deriveResourceLinks()`가 `section.actions`에서 뽑아냄 — 여러 preset 버튼을 늘어놓지 않음) + 첨부파일(`ResourceFiles`, 변경 없음). "누가/언제" 배지, 카테고리 간 `goto` 이동 버튼은 렌더링에서 뺐다(데이터에는 남아있지만 안 씀 — 향후 필요 시 복원 가능, 안전 문구 자체는 한 글자도 새로 쓰거나 빼지 않음).
- **자료 내용**: 기존 29→30개 섹션(재확인: waste 8·special 5·prior 6·signage 4·ops 7)의 title/summary/steps/notice 텍스트는 의미를 바꾸지 않고 그대로 유지했다. 딱 두 곳만 문구를 손봤는데, 둘 다 "임베드가 이제 없다"는 사실을 반영하기 위해서다(안전 규정이 아니라 앱 기능 설명 문장): `special.targets`(현재 보유 특별관리물질 실시간 목록은 이제 시약목록 필터에서 확인한다고 명시), `ops.chem-register`(SchoolRegistrationView의 "최근 N일 조회" 단계 대신 시약목록 선택→Excel 내보내기 단계로 교체).
- **삭제한 사용자 기능**: (1) `ResourceReagentList`(특별관리물질 실시간 요약 위젯, `special.targets`의 `specialTargets` 임베드) — 시약목록에 이미 있는 특별관리물질 필터와 중복이라 제거하고 시약목록 딥링크 1개로 교체. (2) `SchoolRegistrationView`(최근 입고 전체를 훑는 편집 그리드, `ops.chem-register`의 `schoolRegistration` 임베드) — 시약목록 선택목록의 "학교 화학물질 등록 양식" 내보내기(`exportSchoolRegistrationForPicked`, `PickedListModal.jsx`)가 이미 같은 Excel 생성 로직(`lib/schoolRegistrationExport.js`)을 쓰는 canonical 경로라 제거. (3) 자료 카테고리 안의 "공지사항 게시판 열기" 카드 — Home 화면에 이미 독립 메뉴가 있어 중복. (4) `type==='contact'`(비상연락처 alert) — 자료 문서 핵심 기능이 아니고 새 배치 영역을 만들 필요도 없어 제거(app_settings의 emergency_contact/lab_professor/lab_assistant/lab_phone/safety_dept_phone 키 자체는 안 지움 — 이제 어떤 화면도 읽지 않을 뿐).
- **유지한 사용자 기능**: 첨부파일 보기/다운로드 + 관리자 CMS(추가/수정/새 버전/현재 자료 지정/삭제, `ResourceFiles`/`ResourceFileForm`/`ResourceAdminAuth`/`resource-admin` Supabase Auth 계정, 전부 그대로). 공식 외부 링크(학교 연구실안전관리시스템/KOSHA 경고표지, `app_settings.school_safety_system_url`/`kosha_label_url`) — 관련 있는 카드에서만 "공식 사이트 열기 ↗" 1개로. `SafetySignage`(`/safety-signage`, 출입구 표지 현황 + 유해인자 취급관리대장 Excel) — 조사 결과 Reagent List의 범용 내보내기와 겹치지 않는 별도 규정 서식(취급관리대장은 산업안전보건법 관련 특정 양식)이라 **유지 결정**(코드 복잡도가 아니라 "다른 canonical 화면과 실제로 중복되는가"를 기준으로 판단 — 중복이 아니라서 안 지움), 카드 안 단순 링크 1개로만 연결. `Safety.jsx`(`type='safety'` 공지 read-only archive) — `/notices`는 `type='notice'`만 보여줘서(`Notices.jsx:139`) `Safety.jsx`가 과거 게시글의 유일한 접근 경로이므로 **유지**, 손대지 않음.
- **성능**: 카드 30개가 한 화면에 동시에 보이므로 `ResourceFiles`가 카드마다 따로 `resource_files`를 조회하던 방식은 30번의 병렬 요청이 된다 — `getAllResources()`(전체 1회 조회) + `ResourceFiles`의 새 `initialRows` prop(최초 렌더는 그 결과를 그대로 쓰고 네트워크 조회 생략, 관리자가 추가/수정/삭제한 뒤의 재조회는 기존처럼 해당 카드만 다시 조회)으로 1회 조회로 줄였다.
- **DB/스키마**: 변경 없음. `resource_files.category_key`/`section_key`는 그대로 `resourceGuides.js`의 원래 키(카테고리 5개는 안 바뀜 — 화면에 보이는 3그룹 필터는 표시 전용 매핑일 뿐). RLS/RPC/Storage 정책 변경 없음, migration 없음.
- **삭제한 파일**(`git rm`, 참조 0 확인 후): `src/components/resources/ResourceGuidePage.jsx`, `ResourceReagentList.jsx`, `ResourceReagentCard.jsx`, `src/components/PillNav.jsx`(ResourceReagentList가 유일한 다른 사용처였음), `src/components/signage/SchoolRegistrationView.jsx`. `src/lib/schoolRegistrationExport.js`의 `fetchActiveLotsSince`/`validateSchoolRegistrationRow`(SchoolRegistrationView 전용이던 export)도 제거, 나머지 export(`fetchActiveLotsForReagents`/`buildSchoolRegistrationRows`/`writeSchoolRegistrationExcel`/`exportSchoolRegistrationForPicked`)는 선택목록 경로가 계속 쓰므로 유지.
- **유지한 의심 파일과 이유**: `src/components/signage/EntranceSignageView.jsx`/`HazardLedgerView.jsx` — SafetySignage를 유지하기로 했으므로 그 두 탭 구현도 그대로 유지(참조는 여전히 `SafetySignage.jsx`뿐). `src/pages/Safety.jsx` — 위 이유로 유지.
- **테스트**: `scripts/ui/test-resources.mjs` 신설(26개 — 필터 칩 4개/한 세로 목록 30개·카테고리별 필터 개수·공지사항 카드 없음·ResourceReagentList/SchoolRegistrationView/비상연락처 없음·시약목록 딥링크 1개·첨부파일 즉시 노출·SafetySignage 링크 유지·공식 링크·관리자 CMS 재확인·모바일 320~430 overflow 0). `scripts/ui/audit-a11y-mobile.mjs`의 `resources` 항목 axe critical/serious 0(모바일 6종+데스크톱 3종) — 카테고리 칩/링크 버튼을 44px 미만이던 걸 44px로 키워 새로 발견된 터치타깃 위반만 고쳤고, 나머지(하단 네비게이션 가로 overflow, color-contrast)는 Home 등 다른 페이지에도 이미 있는 앱 전역의 기존 이슈라 이번 Phase 범위 밖으로 남겨둠.
- **정정(2026-09-22 자료실 CMS Phase)**: 바로 위 "유지한 의심 파일과 이유"의 `src/pages/Safety.jsx` 유지 판단은 그 다음 Phase(자료실 CMS)에서 뒤집혔다 — 공지 기능 자체가 퇴역하면서 `Safety.jsx`도 함께 삭제됐다. 아래 새 섹션 참고.

## 자료실 CMS — DB 기반 탭/글/첨부파일 + 공지 기능 완전 퇴역 (2026-09-22, staging 전용 migration 4건)
- **최종 제품 방향 확정**: 공지사항·자료 두 영역을 더 이상 따로 운영하지 않는다. "자료실" 하나 — 관리자가 탭을 만들고 그 탭 안에 글을 쓰고 글 밑에 파일을 첨부하면, 일반 사용자는 탭을 골라 글을 읽고 첨부파일을 연다. `resourceGuides.js`(코드 하드코딩)와 두 화면(공지사항 게시판/자료)을 유지하지 않는다.
- **DB 신설**(staging에만 적용, production 미적용):
  - `20260925090000_resource_tabs_articles.sql` — `resource_tabs`(id/name unique/sort_order), `resource_articles`(id/tab_id→resource_tabs **on delete restrict**/title/summary/audience/timing/steps jsonb/notice/link_label/link_url/sort_order/legacy_category_key/legacy_section_key). RLS는 `resource_files`와 똑같은 4-정책 패턴(읽기: anon+authenticated 전체 공개 / 쓰기: authenticated + `public.is_admin()`) — 새 관리자 체계를 만들지 않고 기존 `admin_users`/`is_admin()`을 그대로 재사용.
  - `20260925100000_resource_files_article_id.sql` — `resource_files.article_id`(→`resource_articles` **on delete restrict**) 추가, `category_key`/`section_key`는 지우지 않고 NOT NULL만 제거(legacy 추적용으로 남김 — 새 파일은 이 두 컬럼을 정체성으로 안 쓴다). `(article_id, resource_key)` partial unique index 추가(legacy 유일성 index는 그대로 유지, 새 행은 category_key/section_key가 null이라 안 부딪힘).
  - `20260925110000_resource_set_current_article.sql` — `set_resource_current` RPC를 article_id 인지하도록 교체(`article_id` 있으면 그 범위, 없으면 기존 category_key/section_key 범위로 폴백 — 기존 RPC를 깨뜨리지 않음).
  - `20260925120000_backup_restore_resource_library.sql` — `_backup_tables('full')` 배열에 `resource_tabs`, `resource_articles`를 `resource_files` 바로 앞(부모→자식 FK 순서)에 추가. `_backup_schema_version`/FK 오차 검증/복원 삽입 순서는 전부 이 배열을 그대로 도는 generic 코드라 추가 수정이 필요 없었다(실제 staging full backup/restore rehearsal로 확인, 아래 참고).
  - 적용 방법: 이 repo는 `supabase db push`(CLI 자체 migration 이력 테이블)를 안 쓰고 `npx supabase db query --linked --file <path>`로 파일 하나씩 직접 실행해왔다(`scripts/staging/reset-and-run-all.sh`와 동일 패턴) — `supabase migration list`의 Remote 칼럼이 전부 비어 있는 게 정상이며 `db push`를 그대로 실행하면 이미 적용된 41개 migration을 처음부터 다시 시도하니 사용하지 않았다.
- **기존 콘텐츠 이관**(migration이 아니라 별도 1회성 스크립트로 처리 — 프로덕션에 아직 판단이 안 된 콘텐츠 시드를 "스키마 migration"에 몰래 끼워 넣지 않기 위해): `scripts/staging/seed-resource-articles.mjs`가 `resourceGuides.js`(삭제 전 스냅샷, `scripts/staging/resource-articles-seed-data.json`로 얼려 둠)의 30개 글을 그대로(title/summary/audience/timing/steps/notice 의미 변경 없이) `resource_articles`로 옮기고, `resource_files.article_id`를 category_key+section_key 매칭으로 backfill한다. 매칭 안 되는 행이 있으면 임의 배정하지 않고 즉시 중단(현재 매칭 실패 0건). `reagent-search`/`goto` 액션은 버리고, `route` 액션(있으면 우선) 또는 `school`/`kosha` 공식 링크 중 1개만 `link_label`/`link_url`로 남긴다(공식 링크는 migration 시점의 실제 `app_settings` 값을 그대로 사용). 탭 3개(안전·폐기/서식·양식/연구실 운영)는 기존 `CATEGORY_GROUP` 매핑 그대로 seed. staging 결과: tabs 3, articles 30(안전·폐기 17·서식·양식 6·연구실 운영 7), orphan resource_files 0.
- **`resourceGuides.js` 폐지**: 참조가 `ResourceCard.jsx`(자신도 함께 삭제)뿐임을 확인한 뒤 `git rm`. 콘텐츠의 source of truth는 이제 DB뿐이다(코드와 DB에 같은 글을 동시에 유지하지 않음).
- **새 프론트엔드 구조**(`Resources.jsx`는 orchestration만, CRUD는 컴포넌트로 분리):
  - `Resources.jsx` — 탭/글/첨부파일 조회(각각 1회 배치 조회, 글·파일마다 따로 안 부름) + 선택 탭 상태.
  - `components/resources/ResourceLibraryTabs.jsx` — `role="tablist"`/`role="tab"`/`aria-selected` 표준 탭 패턴. "전체"만 DB row가 아닌 화면 synthetic 탭.
  - `components/resources/ResourceArticleCard.jsx` — 제목/누가·언제(있을 때만)/요약/해야 할 일(steps bullet)/참고·주의사항(notice, 있을 때만)/관련 링크(최대 1개, 외부는 `↗`+새 탭, 내부 `/`경로는 `→`+React Router)/첨부파일. "앱에서 준비하기" 문구·섹션은 없음(자료실은 업무 도구 launcher가 아니라 읽는 곳).
  - `components/resources/ResourceTabManager.jsx` — 관리자 전용 탭 생성/이름 수정/순서(↑↓, 라이브러리 없는 단순 버튼)/삭제(그 탭에 글이 있으면 앱에서 먼저 차단 + `resource_articles.tab_id`가 `on delete restrict`라 DB도 한 번 더 막음).
  - `components/resources/ResourceArticleEditor.jsx` — 글 작성/수정 모달. 필수는 제목뿐, 나머지는 전부 선택. steps는 줄바꿈 textarea → 빈 줄 제거 후 배열로 저장(rich text/HTML 없음, `dangerouslySetInnerHTML` 사용 안 함). 관련 링크는 이름/주소 함께 있거나 함께 없어야 함(DB CHECK + UI 검증 둘 다).
  - `components/resources/ResourceArticleFiles.jsx` — 첨부파일 목록(`ResourceFileCard.jsx` 표시 그대로 재사용, legacy metadata도 그대로 보임) + 단순 업로드("+ 파일 추가": 파일 + 표시 제목만, 나머지 메타데이터는 기본값) + 삭제. 복잡한 버전관리/메타데이터 편집 UI는 새 CMS에서 의도적으로 감췄다(요청 없으면 노출 안 함) — 옛 `ResourceFiles.jsx`/`ResourceFileForm.jsx`(8개 필드 폼, 새버전/현재자료지정)는 참조 0 확인 후 `git rm`.
  - `ResourceFileCard.jsx`는 `onEdit`/`onNewVersion`/`onSetCurrent`/`onDelete` 각각 prop이 있을 때만 그 버튼을 렌더링하도록 고쳐서(기존엔 `admin`이면 무조건 4개 다 렌더링) 새 단순화 CMS가 "삭제"만 넘겨도 죽은 버튼이 안 남게 했다 — 기존 `ResourceFiles.jsx`(당시엔 살아있었음) 쪽은 4개를 다 넘기므로 동작 그대로.
  - Storage 경로: 새 파일은 `resources/articles/<article_id>/<unique>__<filename>`(`buildArticleStoragePath`, `lib/resourceUpload.js`) — 탭 이름/글 제목이 바뀌어도 경로가 안 바뀐다. 기존 legacy 파일은 옛 `resources/<category>/<section>/...` 경로 그대로 두고 옮기지 않았다.
- **공지사항 기능 완전 퇴역**(UI만 — DB는 보존):
  - 삭제: `src/pages/Notices.jsx`, `NoticeDetail.jsx`, `Safety.jsx`(과거 `type='safety'` 공지 read-only archive) — App.jsx에서 참조 0 확인 후 `git rm`.
  - `/notices`, `/notices/:id`, `/safety`, `/safety/:id` → `/resources`로 즉시 redirect(옛 bookmark 호환). `/safety-signage`는 게시판이 아니라 별도 도구라 이번에 손대지 않음(그대로 유지).
  - Home `QUICK_MENU`에서 "공지사항" 타일 삭제, "자료" 타일은 label "자료실"/sub "안전·업무 안내와 서식 확인"으로 교체. `Layout.jsx` NAV_ITEMS(사이드바+모바일 bottom nav 공용)도 "자료" → "자료실". `SafetySignage.jsx`의 breadcrumb도 "자료" → "자료실"로 맞춤.
  - **`notices`/`notice_files` DB 테이블/행은 하나도 지우지 않았다** — DROP/DELETE 없음, 백업 범위(`_backup_tables('full')`)도 그대로 포함. 이번 Phase 시작 시점 staging 실측: `notices(type='notice')` 0건, `notices(type='safety')` 0건, `notice_files` 0건(과거 QA로 비어 있던 상태 그대로) — 즉 이번에 잃은 실제 데이터는 없다.
  - `notice_increment_views` RPC 등 백엔드는 그대로 둠(프론트에서 더 이상 호출하지 않을 뿐, RPC/RLS/스키마 변경 없음).
- **RLS 실측 확인**(staging, `scripts/staging/qa-resource-rls.mjs`, 8/8 PASS): anon SELECT 허용/INSERT 거부, admin_users 미등록 Auth 계정 INSERT 거부(resource_tabs·resource_articles 둘 다), admin_users 등록된 Auth 계정 INSERT/DELETE 성공.
- **실제 staging 관리자 CMS QA**(`scripts/qa/qa-resource-library.mjs`, 17/17 PASS, QA 전용 탭/글/파일만 사용 후 정리): 탭 생성 → 이름 수정 → 순서 변경(↓) → 글 작성 → 일반 화면 즉시 반영(누가/언제/steps/notice) → 글 수정 → 다른 탭으로 이동(첨부파일은 article_id를 따라가므로 Storage 이동 없이 그대로 보임) → 파일 2개 업로드(즉시 노출, 실제 200 확인) → 파일 교체(새 CMS엔 "새 버전" UI가 없어 삭제 후 재업로드로 확인) → 파일 삭제 → 첨부파일이 있으면 글 삭제 차단 → 첨부파일 전부 삭제 후 글 삭제 성공 → 빈 QA 탭 삭제. 이 과정에서 실제 버그 하나 발견·수정: `Resources.jsx`가 글 저장 후 `setEditorState(null)`을 `loadTabsAndArticles()` 완료보다 먼저 호출해 모달이 새 데이터 도착 전에 먼저 닫히는 순간이 있었다 — await 순서를 뒤집어 고쳤다(재조회 완료 후에만 모달이 닫히도록).
- **staging 실브라우저 시각/접근성 QA**(`scripts/qa/qa-resource-visual.mjs`, 19/19 PASS): desktop 1440×900/1366×768·mobile 390×844/360×800에서 실제 이관된 30개 글 전부 렌더, 탭 전환, 가로 overflow 0, 공지사항 카드 없음, axe critical/serious 0(전체 탭 + 관리자 컨트롤 + 탭 관리 모달 열린 상태 포함), production 접속 0.
- **DB schema**: `resource_tabs`/`resource_articles` 신설 + `resource_files.article_id` 추가는 위 4개 migration으로 staging에만 적용. production은 미적용(11개 대기 migration에 이 4개가 더해져 이제 **15개**가 됨 — 다음 Production Gate Phase에서 반드시 재계산할 것, 지금 숫자를 그대로 박아넣지 말 것).
- **테스트**: `scripts/ui/test-resources.mjs` 전면 재작성(DB 기반 탭/글, 옛 하드코딩 카운트 기반 버전은 폐기) — 탭 3+전체, 글 렌더링(누가/언제/steps/notice/링크/첨부파일), 관리자 버튼 노출(비관리자는 전혀 안 보임), 공지 기능 완전 퇴역(Home 타일·사이드바 라벨·구 라우트 4종 redirect), axe, 모바일 overflow. `scripts/ui/test-backup-restore-tab.mjs`/`scripts/staging/test-backup-restore-full.mjs`의 `FULL` 배열에 `resource_tabs`/`resource_articles` 추가(24→26개 테이블) — 후자는 실제 staging에서 풀 사이클(seed→backup→dry-run 실패 케이스들→execute→비교→재실행 거부→cross-project rewrite) 29/29 PASS로 재확인. `test-reagent-ux-consolidation.mjs`의 breadcrumb 기대값도 "자료실"로 갱신.
- **`scripts/qa/qa-notice.mjs` 삭제**: 공지 상세 breadcrumb만 검증하던 단일 목적 스크립트라 `/notices/:id` redirect로 완전히 무의미해짐 — 참조 0 확인 후 `git rm`(다른 QA 스크립트가 이 파일을 import/실행하지 않음).
- **알려진 후속 과제**: `scripts/qa/qa-e-ui.mjs`/`qa-f-network.mjs`는 이전 Phase부터의 QA debt(`/reagents/bulk-edit` 참조)에 더해 이번 Phase의 공지/자료 관련 항목도 갱신이 필요하다 — 두 스크립트 다 여러 화면을 함께 훑는 큰 QA sweep이라 이번 Phase 범위 밖으로 남겨둠.
