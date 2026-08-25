# v2 마이그레이션 노트

## 스키마 확인 방법
이 브랜치에는 `supabase/migrations` 이력이 없었습니다(스키마가 대시보드에서 수기로 만들어짐). `20260826120000_v2_redesign_foundation.sql`은 코드베이스를 grep해서 역추적한 **최선 추정 스키마**를 기준으로 작성했습니다.

실행 전에:
1. `supabase link --project-ref <ref>` 로 실제 프로젝트 연결
2. `supabase db diff` 또는 스테이징에서 먼저 검증
3. 문제 없으면 `supabase db push`

## 이번 마이그레이션에서 하는 일
- **신규**: `students`(로그인), `purchase_request_logs` + `purchase_request_reagent_items` + `purchase_request_goods_items`(구매요청서)
- **확장(컬럼 추가만)**: `reagents`(최종확인일/확인자/직접제조시약/보관상태), `inventory_assignments`/`inventory_counts`/`reagent_change_requests`/`disposal_requests`(학번 계정 연결용 FK 컬럼)
- 기존 컬럼·테이블은 하나도 건드리지 않음 (DROP/RENAME 없음)

## 재사용한 기존 테이블
- `reagent_change_requests` — 학생 수정요청 "대기중→승인/반려" 흐름 그대로 사용
- `disposal_requests` — 폐기신청 "대기중→승인/반려/폐기완료" 흐름 그대로 사용 (승인 시 `reagents.status`를 `archived`로 바꾸는 로직은 앱에서 처리)
- `inventory_sessions`/`inventory_assignments`/`inventory_counts` — 재고실사 구조 그대로 사용

## 남은 결정/구현 사항
- `reagent_lots.current_stock`은 이미 0~100 정수(퍼센트)라서 스키마 변경 불필요 — 10% 단위는 앱 UI에서 강제 (버튼/드롭다운)
- `reagent_change_requests.field_name`을 잔량/미개봉병수/위치까지 다루도록 앱 로직에서 화이트리스트 확장 필요 (DB 제약 아님)
- RLS 정책은 기존 테이블 상태를 몰라서 이번엔 건드리지 않음 — 기존 앱처럼 anon key + 앱단 PIN/학번 체크 방식이면 이대로도 동작하지만, 나중에 점검 권장
- 동일 시약 다른 위치 문제(로트 단위 위치 이전)는 보류 — 별도 마이그레이션에서 다룸
