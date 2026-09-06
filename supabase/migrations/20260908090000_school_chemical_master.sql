-- 학교등록 엑셀 생성 기능 — 강원대 연구실안전관리시스템 화학물질정보 마스터.
-- RegChemicalSample.xlsx 시트2 "화학물질정보"를 그대로 임포트(17,485행, CAS 전부 유일).
-- CAS로 대조해 공식 화학물질명/단위/분류를 가져오는 검증·참조용 테이블 — 학교가 갱신본을
-- 주면 통째로 교체하는 방식이라 school_chemical_master 자체는 앱 데이터와 FK로 엮지 않는다.
create table if not exists school_chemical_master (
  id uuid primary key default gen_random_uuid(),
  cas_no text not null unique,
  name text not null,
  unit text not null,
  category_class text,
  characteristics text,
  registered_date date
);
create index if not exists idx_school_chemical_master_cas on school_chemical_master(cas_no);
comment on table school_chemical_master is 'RegChemicalSample.xlsx 시트2 "화학물질정보" 원본 임포트. 학교 갱신본 수령 시 통째로 재임포트.';

alter table school_chemical_master disable row level security;
