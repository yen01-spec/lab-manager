-- 화면 D/E/F 지원 스키마.

-- D. 특별관리물질 취급일지 — 스펙은 새 테이블 special_substance_log를 제안했지만
-- 이미 있는 special_material_logs를 확장하는 쪽을 택함(중복 테이블 방지, 기존
-- 데이터/화면과 분리되지 않도록). 안전점검 지적사항 반영: 최초입고량 필드 추가.
-- "수정 가능, 삭제 불가(관리자 예외 시 로그)" 요건은 별도 삭제로그 테이블 대신
-- soft-delete 컬럼으로 구현 — 물리적 삭제가 아예 없으니 로그 테이블보다 단순하고,
-- deleted_at이 곧 "삭제 로그"의 역할을 겸함(누가/언제/왜 지웠는지 그 자리에 남음).
alter table special_material_logs
  add column if not exists initial_amount text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_student_id text,
  add column if not exists deleted_by_name text,
  add column if not exists delete_reason text;
comment on column special_material_logs.initial_amount is '이 통을 처음 받았을 때 총량 — 안전점검 지적사항(최초입고량 미기재) 반영';

-- 연구실명(app_settings에 없던 키) 추가는 스크립트에서 처리(키 유일성 제약을
-- 마이그레이션에서 가정하지 않기 위해 REST API로 존재여부 확인 후 삽입).

-- E. 유해인자 취급관리대장 — 신규 테이블 불필요(스펙 확인)라 재사용만 하는데,
-- "필요보호구"만 원본 서식에 원래 공란인 수동 입력 칸이라 저장할 곳이 없어서 추가.
-- CAS 키만 있으면 되는 아주 작은 테이블.
create table if not exists hazard_ledger_notes (
  cas_no text primary key,
  required_ppe text,
  updated_at timestamptz not null default now()
);

-- F. 안전관리규정 자료실 — 기존 documents 스토리지 버킷/notice_files 패턴과 별개로,
-- 카테고리+버전관리가 필요해서 전용 테이블을 둠. 실제 파일은 기존 'documents' 버킷 재사용.
create table if not exists regulation_document (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  category text not null,
  file_url text not null,
  file_size integer,
  uploaded_by text,
  version integer not null default 1,
  previous_version_id uuid references regulation_document(id),
  created_at timestamptz not null default now()
);
comment on table regulation_document is '"교체"해도 이전 버전 행은 지우지 않고 previous_version_id로 이력만 연결 — 최신본은 previous_version_id를 참조하는 행이 없는 것.';

alter table hazard_ledger_notes disable row level security;
alter table regulation_document disable row level security;
