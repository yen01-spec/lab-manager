-- ════════════════════════════════════════════════════════════════════════
-- 자료실 CMS 2/4 — resource_files를 article_id로 resource_articles에 연결.
--
-- 기존 category_key/section_key는 지우지 않는다(마이그레이션 추적/역추적용, legacy 컬럼으로
-- 남긴다 — NOT NULL만 제거). 새 파일 업로드는 category_key/section_key를 정체성으로 쓰지 않고
-- article_id만 쓴다. 기존 파일은 하나도 잃지 않는다 — article_id 채우기(backfill)는 별도
-- staging 전용 데이터 스크립트(scripts/staging/seed-resource-articles.mjs)가 category_key+
-- section_key로 정확히 매칭해서 수행하고, 매칭 안 되는 행이 하나라도 있으면 임의 배정하지
-- 않고 중단·보고한다(이 migration은 스키마만 바꾼다 — 데이터는 건드리지 않는다).
--
-- ⚠️ staging 전용. production 미적용.
-- ════════════════════════════════════════════════════════════════════════

alter table resource_files add column if not exists article_id uuid references resource_articles(id) on delete restrict;
comment on column resource_files.article_id is '새 자료실의 canonical 연결(글 1개 = 첨부파일 N개). category_key/section_key는 legacy 추적용으로만 남는다.';

alter table resource_files alter column category_key drop not null;
alter table resource_files alter column section_key drop not null;
comment on column resource_files.category_key is '[legacy] 옛 resourceGuides.js 1차 카테고리 key. 새 파일은 null — article_id가 정체성.';
comment on column resource_files.section_key is '[legacy] 옛 resourceGuides.js 2차 section key. 새 파일은 null — article_id가 정체성.';

create index if not exists resource_files_article_idx on resource_files (article_id, sort_order);

-- article_id 기반 "현재 자료" 유일성 — 기존 (category_key, section_key, resource_key) partial unique index는
-- legacy 행을 위해 그대로 둔다(새 행은 category_key/section_key가 null이라 서로 충돌하지 않음).
create unique index if not exists resource_files_article_current_idx
  on resource_files (article_id, resource_key)
  where is_current and resource_key is not null and article_id is not null;
