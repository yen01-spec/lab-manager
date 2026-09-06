-- 안전표지 관리 기능 (강원대 연구실 안전점검 지적사항 대응)
-- 1) reagents.is_yudok: 화학물질관리법상 유독물 등 여부. KECO GHS API의 sbstnTypeUnqno
--    첫 항목을 그대로 저장(예: "유독물질") — 지금까지는 ReagentDetail.jsx에서 매번 조회만
--    하고 DB에 저장을 안 해서 목록 전체 기준 조회/집계가 불가능했음.
alter table reagents
  add column if not exists is_yudok text;
comment on column reagents.is_yudok is 'KECO GHS API sbstnTypeUnqno 첫 항목(화학물질관리법 유독물 등 여부). hazard/ghs_pictograms와 같은 조회 시점에 채워짐.';

-- 2) 안전보건표지 마스터 (산업안전보건법 시행규칙 별표6 중 GHS 그림문자로 트리거되는 것 +
--    특별관리물질(CMR) 매칭으로 트리거되는 503 특수표지)
create table if not exists signage_master (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  ghs_pictogram_codes text[],
  legal_basis text,
  location text,
  shape_desc text,
  image_path text,
  priority integer not null default 100,
  is_pinned boolean not null default false,
  trigger_type text not null default 'ghs_pictogram'
);
comment on table signage_master is '산업안전보건법 시행규칙 별표6 안전보건표지 마스터. trigger_type: ghs_pictogram(GHS 그림문자 매칭) | special_management(44종 특별관리물질 매칭).';

-- 3) 용기 경고표지 규격 (산업안전보건법 시행규칙 제170조)
create table if not exists label_size_rule (
  id uuid primary key default gen_random_uuid(),
  min_volume_l numeric,
  max_volume_l numeric,
  spec_text text not null,
  sort_order integer not null
);

-- 4) 용기 라벨 문구 템플릿 — 법정 고지문구라 원문 그대로 저장(재작성 금지).
--    시드 14종부터 시작, 추후 KOSHA MSDS 실시간 조회 결과로 확장 축적 예정.
create table if not exists label_phrase_template (
  id uuid primary key default gen_random_uuid(),
  cas_no text not null unique,
  name_ko text not null,
  name_en text not null,
  signal_word_ko text not null,
  signal_word_en text not null,
  hazard_statements_ko text[] not null,
  hazard_statements_en text[] not null,
  precautionary_statements_ko text[] not null,
  precautionary_statements_en text[] not null,
  source text not null default 'seed'
);
comment on table label_phrase_template is '용기 경고표지 법정 문구. source: seed(강원대 소분용기 14종 자료) | kosha(실시간 조회 캐시).';

alter table signage_master disable row level security;
alter table label_size_rule disable row level security;
alter table label_phrase_template disable row level security;
