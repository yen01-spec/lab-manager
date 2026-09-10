-- 자료 탭 관리자 write 보안 (개편 Phase 5-h2 보안 선행).
--
-- 목표: resource_files 와 documents 버킷의 resources/ 경로 write 를 Supabase Auth 기반
--       "관리자"에게만 허용한다. 읽기(SELECT / 파일 다운로드)는 기존대로 anon 허용.
--       앱 전체 인증(students + localStorage)은 그대로 두고, 관리자 자료관리 write 에만
--       별도 Supabase Auth 세션을 요구한다.
--
-- 관리자 판별: admin_users 테이블(user_id → auth.users.id, active). user_metadata 는
--             사용자가 바꿀 수 있어 근거로 쓰지 않는다. app_metadata 대신 별도 테이블을
--             쓰는 이유 — 관리자 추가/비활성화를 SQL Editor 로 눈에 보이게 관리하기 위함,
--             그리고 이후 다른 테이블에서도 public.is_admin() 을 재사용하기 위함.
--
-- 이 migration 은 기존 데이터/파일/정책을 지우지 않는다. resource_files RLS 를 켜고
-- 정책을 추가하며(20260913090000 에서 disable 했던 것을 새로 enable), storage.objects
-- 에는 resources/ 경로에만 걸리는 RESTRICTIVE 정책 3개(write 3종)를 더한다
-- (기존 permissive "public upload/update/delete" 는 그대로 두고 AND 로 좁힘 → notices/ · msds/
--  등 다른 경로는 영향 없음).

-- ── 1) 관리자 명단 ─────────────────────────────────────────────
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
comment on table admin_users is 'Supabase Auth 사용자 중 자료관리 write 권한이 있는 관리자. 대시보드에서 Auth 사용자 생성 후 이 표에 user_id 를 넣어 관리(추가/active=false 로 회수). RLS 로 잠겨 있어 service_role / SQL Editor 로만 수정 가능.';

alter table admin_users enable row level security;
-- 본인 행만 조회 가능(클라이언트의 "나는 관리자인가" 확인용). insert/update/delete 정책 없음 → service_role 전용.
drop policy if exists admin_users_self_select on admin_users;
create policy admin_users_self_select on admin_users
  for select to authenticated
  using (user_id = auth.uid());

-- ── 2) 관리자 판별 함수 (RLS 정책에서 재사용) ─────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and active
  );
$$;
comment on function public.is_admin() is 'auth.uid() 가 admin_users 에서 active 인지. security definer 라 admin_users RLS 를 우회해서 확인.';
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ── 3) resource_files RLS ─────────────────────────────────────
alter table resource_files enable row level security;

drop policy if exists resource_files_read on resource_files;
create policy resource_files_read on resource_files
  for select to anon, authenticated
  using (true);

drop policy if exists resource_files_admin_insert on resource_files;
create policy resource_files_admin_insert on resource_files
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists resource_files_admin_update on resource_files;
create policy resource_files_admin_update on resource_files
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists resource_files_admin_delete on resource_files;
create policy resource_files_admin_delete on resource_files
  for delete to authenticated
  using (public.is_admin());

-- ── 4) Storage: documents 버킷의 resources/ 경로 write 는 관리자만 ─
-- RESTRICTIVE 정책은 기존 permissive 정책과 AND 로 결합된다.
-- 조건: (documents 가 아니거나) OR (resources/ 경로가 아니거나) OR (관리자) → 셋 다 아니면 거부.
-- SELECT(읽기)에는 걸지 않는다 → 기존 "public read" 로 anon 다운로드 유지.
drop policy if exists "resources path admin insert" on storage.objects;
create policy "resources path admin insert" on storage.objects
  as restrictive for insert to public
  with check (
    bucket_id <> 'documents'
    or name not like 'resources/%'
    or public.is_admin()
  );

drop policy if exists "resources path admin update" on storage.objects;
create policy "resources path admin update" on storage.objects
  as restrictive for update to public
  using (
    bucket_id <> 'documents'
    or name not like 'resources/%'
    or public.is_admin()
  )
  with check (
    bucket_id <> 'documents'
    or name not like 'resources/%'
    or public.is_admin()
  );

drop policy if exists "resources path admin delete" on storage.objects;
create policy "resources path admin delete" on storage.objects
  as restrictive for delete to public
  using (
    bucket_id <> 'documents'
    or name not like 'resources/%'
    or public.is_admin()
  );
