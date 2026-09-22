-- ════════════════════════════════════════════════════════════════════════
-- 자료실 CMS 1/4 — resource_tabs / resource_articles 신설.
--
-- 자료 탭의 콘텐츠 source of truth를 코드(src/lib/resourceGuides.js 하드코딩)에서
-- DB로 옮긴다. 관리자: 탭 생성 → 그 탭 안에 글 작성 → 글 밑에 파일 첨부.
-- 일반 사용자: 탭 선택 → 글 읽기 → 첨부파일 열기.
--
-- 관리자 write 게이트는 기존 resource_files와 동일하게 public.is_admin()(admin_users 기반)을
-- 그대로 재사용한다 — 새 관리자 체계를 만들지 않는다.
--
-- ⚠️ staging 전용. production 미적용.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists resource_tabs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table resource_tabs is '자료실 상단 탭. "전체"는 DB row가 아니라 화면에서만 합성하는 synthetic 탭이다.';

create unique index if not exists resource_tabs_name_idx on resource_tabs (name);

create table if not exists resource_articles (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references resource_tabs(id) on delete restrict,

  title text not null,
  summary text,
  audience text,          -- "누가" — 선택
  timing text,            -- "언제" — 선택
  steps jsonb not null default '[]'::jsonb,   -- 해야 할 일. 문자열 배열만 허용(문서 참고).
  notice text,            -- 참고/주의사항 — 선택, 노란 박스로 표시

  link_label text,        -- 관련 링크 1개까지만(선택) — label/url은 함께 있거나 함께 없어야 함
  link_url text,

  sort_order integer not null default 0,

  -- 기존 resourceGuides.js 콘텐츠에서 옮겨온 글의 원래 key(마이그레이션 추적용, 새 글은 null).
  legacy_category_key text,
  legacy_section_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resource_articles_title_not_blank check (btrim(title) <> ''),
  constraint resource_articles_steps_is_array check (jsonb_typeof(steps) = 'array'),
  constraint resource_articles_link_pair check ((link_label is null) = (link_url is null))
);
comment on table resource_articles is '자료실 글 — 탭 하나에 여러 글, 삭제는 restrict(첨부파일이 있으면 탭/글 모두 앱에서 먼저 막고, FK도 조용한 cascade를 허용하지 않는다).';
comment on column resource_articles.steps is '"해야 할 일" — 줄바꿈으로 입력받은 문자열을 빈 줄 제거 후 배열로 저장. rich text 아님, HTML 직접 저장 금지.';
comment on column resource_articles.legacy_category_key is 'resourceGuides.js 1차 카테고리 key(waste/special/prior/signage/ops) — 옛 resource_files.category_key와 매칭용. 새 글은 null.';
comment on column resource_articles.legacy_section_key is 'resourceGuides.js 2차 section key — 옛 resource_files.section_key와 매칭용. 새 글은 null.';

create index if not exists resource_articles_tab_idx on resource_articles (tab_id, sort_order);
create index if not exists resource_articles_legacy_idx on resource_articles (legacy_category_key, legacy_section_key);

alter table resource_tabs enable row level security;
alter table resource_articles enable row level security;

-- 읽기: 로그인 여부와 무관하게 전체 공개(기존 resource_files와 동일한 원칙).
create policy resource_tabs_read on resource_tabs
  for select to anon, authenticated
  using (true);
create policy resource_articles_read on resource_articles
  for select to anon, authenticated
  using (true);

-- 쓰기: Supabase Auth + admin_users + public.is_admin() 뿐. 학생 세션/공유 PIN/로컬스토리지 값 사용 금지.
create policy resource_tabs_admin_insert on resource_tabs
  for insert to authenticated
  with check (public.is_admin());
create policy resource_tabs_admin_update on resource_tabs
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy resource_tabs_admin_delete on resource_tabs
  for delete to authenticated
  using (public.is_admin());

create policy resource_articles_admin_insert on resource_articles
  for insert to authenticated
  with check (public.is_admin());
create policy resource_articles_admin_update on resource_articles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy resource_articles_admin_delete on resource_articles
  for delete to authenticated
  using (public.is_admin());
