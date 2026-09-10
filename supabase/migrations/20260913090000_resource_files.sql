-- 자료 탭(Resources)의 공식 자료 파일 저장 구조 (개편 Phase 5-h1).
--
-- 배경: 자료 탭의 각 category/section마다 필수 양식 / 공식 지침·매뉴얼 / 참고자료 파일을
--       메타데이터·버전 이력과 함께 등록해야 한다. 기존 notice_files는 공지 글에 종속돼
--       있고, regulation_document는 category+file만 있어(section/유형/발행기관/개정·시행일
--       /is_current 없음) 요구사항을 못 채운다 → 전용 테이블 신설.
--
-- 재사용:
--   * Storage 는 기존 'documents' 버킷을 그대로 사용(새 버킷 안 만듦).
--     앱 전반이 getPublicUrl → file_url 저장 방식이라 file_url 도 저장하되,
--     버킷/URL 정책이 바뀌어도 데이터를 안 고쳐도 되도록 storage_path 를 원본 기준값으로 둔다.
--   * category_key / section_key 는 resourceGuides.js 의 안정적 key(waste/special/prior/
--     signage/ops, reagent/liquid/pickup/targets/register/prepare/chem-register 등)를
--     그대로 쓴다. DB enum 으로 고정하지 않는다(자료 탭 section 추가 시 migration 없이 확장 가능).
--
-- RLS: 이 프로젝트의 다른 커스텀 테이블과 동일하게 RLS 비활성(20260826140000_disable_rls_new_tables.sql
--      참고). 이 앱은 Supabase Auth 를 쓰지 않고 세션이 localStorage 기반이라 DB 레벨에서
--      관리자를 판별할 수단이 없다. 관리자 write 제한은 기존 관행대로 프론트엔드(isAdmin)에서 한다.

create table if not exists resource_files (
  id uuid primary key default gen_random_uuid(),

  category_key text not null,               -- resourceGuides 1차 카테고리 key (waste/special/prior/signage/ops)
  section_key  text not null,               -- 그 안의 2차 section key (예: pickup, targets, chem-register)

  resource_key text,                        -- 같은 문서의 여러 버전을 묶는 논리 key. null 이면 단독 파일(버전 묶음 아님)

  title text not null,                      -- 화면에 보이는 자료명
  resource_type text not null
    check (resource_type in ('form', 'official', 'reference')),  -- 필수 양식 / 공식 지침·매뉴얼 / 참고자료

  issuer text,                              -- 발행기관. 확인 안 되면 null (임의로 채우지 않음)
  revision_date  date,                      -- 개정일 (nullable)
  effective_date date,                      -- 시행일 (nullable) — 개정일과 다를 수 있어 분리

  version_label text,                       -- "2026 개정판" 등 표시용 (nullable)
  is_current boolean not null default true, -- 현재 사용 자료 여부. 이전 버전은 false 로 두고 삭제하지 않음

  storage_path text not null,               -- 'documents' 버킷 내부 경로 (원본 기준값). 예: resources/waste/pickup/2026/xxx.pdf
  file_url text,                            -- getPublicUrl 결과 (앱 관행상 편의 저장, nullable)
  original_filename text,                   -- 업로드된 원본 파일명 (중복 업로드 확인용)
  mime_type text,                           -- application/pdf, application/haansofthwp 등

  sort_order integer not null default 0,    -- section 안에서의 표시 순서
  notes text,                              -- 개정/시행 이력 등 자유 메모 (예: "기존 37종 2022.10.18 개정 / 추가 7종 2023.10.19 시행")

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()  -- 갱신 시 앱에서 now() 로 세팅 (프로젝트에 updated_at 트리거 관행 없음)
);

comment on table resource_files is '자료 탭 공식 자료 파일 + 메타데이터 + 버전 이력. Storage 는 documents 버킷. category_key/section_key 는 resourceGuides.js key. 이전 버전 행은 is_current=false 로 보존(삭제 금지).';
comment on column resource_files.resource_key is '같은 문서 계열의 버전을 묶는 key. 파일명이 비슷하다고 자동으로 같은 계열로 보지 않는다 — 관리자가 지정.';
comment on column resource_files.storage_path is 'documents 버킷 내부 경로(원본 기준). URL 방식이 바뀌어도 이 값은 유지.';

-- 조회 인덱스: 자료 탭은 항상 (category, section) 단위로 현재 자료를 읽는다.
create index if not exists resource_files_cat_sec_idx
  on resource_files (category_key, section_key, is_current, sort_order);

-- 현재 자료 유일성: 같은 (category, section, resource_key) 조합에서 is_current=true 는 최대 1개.
-- resource_key 가 null 인 단독 파일은 이 제약에서 자유롭다(null 은 unique 에서 서로 구별됨).
-- 5-h2 에서 새 버전을 현재 자료로 지정할 때는 "같은 resource_key 의 기존 current 를 먼저 false 로
-- 바꾼 뒤 insert/update" 순서를 지켜야 한다(간단 update 2건, 트리거 안 만듦).
create unique index if not exists resource_files_one_current_idx
  on resource_files (category_key, section_key, resource_key)
  where is_current and resource_key is not null;

alter table resource_files disable row level security;
