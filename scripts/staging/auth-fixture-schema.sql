-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
--
-- students/app_settings 최소 baseline — 2026-09-16 RLS 보안 감사에서 만든
-- 20260916090000_harden_student_auth.sql을 staging에서 검증하기 위한 fixture.
-- production 실제 schema(read-only 확인 완료)와 컬럼/타입/제약 그대로 일치시킨다.
create table if not exists students (
  student_id     text primary key,
  name           text not null,
  birth_date     date not null,
  is_admin       boolean not null default false,
  password_hash  text,
  created_at     timestamptz not null default now(),
  is_super       boolean not null default false
);
comment on table students is 'STAGING TEST ONLY. Phase RLS-security-audit fixture — production 실제 schema와 동일.';

create table if not exists app_settings (
  key   text primary key,
  value text not null
);
comment on table app_settings is 'STAGING TEST ONLY. Phase RLS-security-audit fixture — production 실제 schema와 동일.';
-- production은 이미 RLS enabled 상태였다(P0 audit 확인) — fixture도 그대로 재현해야
-- migration의 정책 교체(drop/create)가 실제와 같은 의미를 갖는다.
alter table app_settings enable row level security;
drop policy if exists app_settings_read on app_settings;
create policy app_settings_read on app_settings for select to anon, authenticated using (true);

insert into app_settings (key, value) values ('admin_password', 'TEST-ADMIN-PIN-0001')
on conflict (key) do nothing;

insert into students (student_id, name, birth_date, is_admin) values
  ('TEST-STU-0001', 'TEST Student One', '2000-01-01', false),
  ('TEST-STU-0002', 'TEST Student Two', '2001-02-02', false)
on conflict (student_id) do nothing;
