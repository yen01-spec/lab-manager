-- 산업안전보건기준에관한 규칙 제439조: 특별관리물질 취급 시 취급일지를 작성해
-- 30년 이상 보존해야 함(원본 양식: 강원대 연구실안전관리시스템 제공 자료).
-- 30년 보존 요건 때문에 reagent_id는 참고용 FK일 뿐, 시약이 나중에 삭제/변경돼도
-- 로그 자체는 안전하게 남도록 substance_name/cas_no를 기록 시점 값으로 스냅샷 저장한다
-- (disposal_requests.reagent_name과 동일한 패턴).
create table if not exists special_material_logs (
  id uuid primary key default gen_random_uuid(),
  reagent_id uuid references reagents(id),
  substance_name text not null,
  cas_no text,
  handling_date date not null,
  amount text,
  work_description text,
  ppe_worn text,
  incident_details text,
  handler_student_id text,
  handler_name text not null,
  confirmed_by_student_id text,
  confirmed_by_name text,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_special_material_logs_reagent on special_material_logs(reagent_id);
create index if not exists idx_special_material_logs_date on special_material_logs(handling_date);
comment on table special_material_logs is '특별관리물질 취급일지. 법정 보존기한 30년 이상 — 삭제 UI를 두지 않는다.';

-- 기존 앱의 다른 테이블들과 동일한 보안 모델(anon 키로 앱단 권한 체크만, DB는 개방)
alter table special_material_logs disable row level security;
