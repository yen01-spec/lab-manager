-- 재고실사 개편: 실사목적, 미확인/이상여부/위치변경 스테이징, 되돌리기용 book 값,
-- 그리고 "1단계 반영 → 2단계 최종 확정" 사이의 검토 대기 표시(pending_confirm).

alter table inventory_sessions
  add column if not exists purpose text not null default 'comprehensive'
    check (purpose in ('quantity_status', 'comprehensive')),
  add column if not exists zones text[];

alter table inventory_counts
  add column if not exists reported_missing boolean not null default false,
  add column if not exists abnormal_note text,
  add column if not exists is_new_registration boolean not null default false,
  add column if not exists staged_location_id uuid references locations(id),
  add column if not exists book_status text,
  add column if not exists book_location_id uuid references locations(id);

alter table reagent_lots
  add column if not exists pending_confirm boolean not null default false;

comment on column inventory_sessions.purpose is '재고/상태확인(quantity_status) 또는 종합실사(comprehensive)';
comment on column inventory_sessions.zones is '실사범위로 선택한 구역 목록(빈 배열/null = 전체)';
comment on column inventory_counts.reported_missing is '실사 중 학생이 분실/미확인으로 표시(스테이징, 완료 처리 시 reagent_lots.status=missing 반영)';
comment on column inventory_counts.abnormal_note is '실사 중 기록한 이상여부 메모(스테이징)';
comment on column inventory_counts.is_new_registration is '이 count row가 실사 도중 신규 등록된 Lot인지';
comment on column inventory_counts.staged_location_id is '실사 중 변경 요청된 위치(스테이징, 종합실사에서만 사용)';
comment on column inventory_counts.book_status is '실사 시작 시점의 Lot 상태(되돌리기용)';
comment on column inventory_counts.book_location_id is '실사 시작 시점의 Lot 위치(되돌리기용)';
comment on column reagent_lots.pending_confirm is '실사 1단계(구역/세션 완료 처리)로 반영은 됐지만 2단계(최종 DB 반영)로 확정 전인 상태 — true인 동안 화면에 연한 배경으로 표시';
