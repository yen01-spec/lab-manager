-- ════════════════════════════════════════════════════════════════════════
-- 학생/관리자 로그인 인증 경로를 서버 사이드로 이전 (RLS 보안 감사, 2026-09-16).
--
-- ⚠️ 이 migration은 작성만 하고 이번 단계에서는 staging에만 적용한다. production에는
--    적용하지 않는다(운영 미적용, Gate 승인 후 별도 적용).
--
-- 발견된 문제: `students` 테이블이 RLS 자체가 꺼져 있고 anon(프론트엔드에 내장된 공개
-- 키)에 SELECT/INSERT/UPDATE/DELETE/TRUNCATE가 전부 부여되어 있었다. 로그인이
-- "학번+생년월일+이름" 매칭 방식이라 anon 키만 있으면:
--   1) `select * from students`로 전체 학생의 birth_date(=사실상 비밀번호 역할)와
--      관리자의 password_hash까지 그대로 읽을 수 있었고,
--   2) 관리자 승격 PIN(app_settings.value where key='admin_password')도 anon SELECT로
--      평문 그대로 읽혀서, 그 PIN으로 아무 학번이나 UPDATE ... SET is_admin=true 가능했다
--      (students에 anon UPDATE가 무제한 허용되어 있었으므로).
-- 즉 anon 키만으로 임의 계정 로그인 + 자가 관리자 승격 + 학생 명단 삭제까지 가능한
-- 상태였다. 근본 원인은 "클라이언트가 비밀값을 받아서 브라우저에서 비교"하는 구조라,
-- RLS만 조여서는 로그인 자체가 깨진다 — 그래서 로그인/승격 로직 전체를 SECURITY DEFINER
-- RPC로 옮기고, 원본 테이블에서는 민감 컬럼(birth_date/password_hash)과 write 권한을
-- anon/authenticated에서 완전히 회수한다(이 프로젝트가 이미 is_admin()/
-- sync_inventory_snapshot에 쓴 것과 동일한 패턴).
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 1) students: RLS 활성화 + 컬럼 단위 최소 권한 ──────────────────────
-- 기존에 student_id/name을 다른 화면(확인자/신청자 표시)에서 읽던 용도는 유지하되,
-- birth_date/password_hash는 어떤 role에도 SELECT grant를 주지 않는다(RLS는 row 단위라
-- column을 못 가리므로 column-level GRANT로 처리). insert/update/delete/truncate는
-- anon/authenticated 모두에서 회수 — 로그인/등록/승격은 전부 아래 RPC를 통해서만.
alter table students enable row level security;

drop policy if exists students_read on students;
create policy students_read on students
  for select to anon, authenticated
  using (true);

revoke all on students from anon, authenticated;
grant select (student_id, name) on students to anon, authenticated;
-- insert/update/delete는 의도적으로 grant하지 않는다(SECURITY DEFINER RPC만 가능).

comment on table students is '학번+생년월일+이름으로 로그인하는 사용자 로스터. birth_date/password_hash는
  2026-09-16부터 anon/authenticated에 컬럼 권한 자체가 없음 — student_check_login 등
  SECURITY DEFINER RPC를 통해서만 검증 가능(Phase: RLS 보안 감사).';


-- ── 2) app_settings: admin_password 키만 공개 SELECT에서 제외 ──────────
-- 다른 키(lab_name/school_safety_system_url 등)는 그대로 공개 읽기 유지.
drop policy if exists app_settings_read on app_settings;
create policy app_settings_read on app_settings
  for select to anon, authenticated
  using (key <> 'admin_password');


-- ── 3) 일반 로그인 확인(비밀번호 없이) ──────────────────────────────────
-- 기존 LoginModal의 "일반 로그인" 분기: 학번 조회 → 이름/생년월일 일치 확인.
-- 존재하지 않으면 'not_found'(프론트가 신규등록 단계로 전환), 불일치면 'mismatch',
-- 일치하면 'ok' + is_admin은 항상 false로 시작(기존 동작 그대로 — 비밀번호 없는 세션은
-- 관리자 권한이 있어도 일반 사용자로 시작).
create or replace function public.student_check_login(
  p_student_id text, p_name text, p_birth_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student students%rowtype;
begin
  select * into v_student from students where student_id = p_student_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_student.name <> p_name or v_student.birth_date <> p_birth_date then
    return jsonb_build_object('status', 'mismatch');
  end if;
  return jsonb_build_object('status', 'ok', 'student_id', v_student.student_id, 'name', v_student.name, 'is_admin', false);
end;
$$;
revoke all on function public.student_check_login(text, text, date) from public;
grant execute on function public.student_check_login(text, text, date) to anon, authenticated;


-- ── 4) 관리자 로그인(비밀번호 포함) ────────────────────────────────────
-- pgcrypto의 crypt(password, hash) = hash 로 bcryptjs가 만든 $2a$/$2b$ 해시를 그대로
-- 검증한다(해시 저장 포맷 변경 없음). 실패 사유를 구분 반환하는 기존 UX 그대로 유지
-- (등록안됨/정보다름/비밀번호틀림 — LoginModal.jsx 기존 3종 에러 메시지와 매핑).
create or replace function public.student_admin_login(
  p_student_id text, p_name text, p_birth_date date, p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student students%rowtype;
begin
  select * into v_student from students where student_id = p_student_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_student.name <> p_name or v_student.birth_date <> p_birth_date then
    return jsonb_build_object('status', 'mismatch');
  end if;
  if v_student.password_hash is null or crypt(p_password, v_student.password_hash) <> v_student.password_hash then
    return jsonb_build_object('status', 'wrong_password');
  end if;
  return jsonb_build_object('status', 'ok', 'student_id', v_student.student_id, 'name', v_student.name, 'is_admin', v_student.is_admin);
end;
$$;
revoke all on function public.student_admin_login(text, text, date, text) from public;
grant execute on function public.student_admin_login(text, text, date, text) to anon, authenticated;


-- ── 5) 신규 학생 등록 ──────────────────────────────────────────────────
create or replace function public.student_register(
  p_student_id text, p_name text, p_birth_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from students where student_id = p_student_id) then
    raise exception '이미 등록된 학번입니다.' using errcode = '23505';
  end if;
  insert into students (student_id, name, birth_date) values (p_student_id, p_name, p_birth_date);
  return jsonb_build_object('student_id', p_student_id, 'name', p_name, 'is_admin', false);
end;
$$;
revoke all on function public.student_register(text, text, date) from public;
grant execute on function public.student_register(text, text, date) to anon, authenticated;


-- ── 6) 세션 재확인(Layout.jsx가 매 진입 시 호출) ────────────────────────
-- 캐시된 student_id로 name/is_admin만 최신화(기존 revalidateSession과 동일 의미 —
-- 별도 재인증 없음, 단지 birth_date/password_hash가 응답에 더는 안 실림).
create or replace function public.student_session_refresh(p_student_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student students%rowtype;
begin
  select * into v_student from students where student_id = p_student_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'student_id', v_student.student_id, 'name', v_student.name, 'is_admin', v_student.is_admin);
end;
$$;
revoke all on function public.student_session_refresh(text) from public;
grant execute on function public.student_session_refresh(text) to anon, authenticated;


-- ── 7) 관리자 승격 (공유 PIN 입력 → 그 값이 본인 비밀번호가 됨, 기존 동작 그대로) ──
create or replace function public.student_admin_upgrade(p_student_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_password text;
  v_student students%rowtype;
begin
  select value into v_admin_password from app_settings where key = 'admin_password';
  if v_admin_password is null or p_pin <> v_admin_password then
    raise exception '비밀번호가 틀렸습니다' using errcode = '28P01';
  end if;

  update students
  set password_hash = crypt(p_pin, gen_salt('bf', 10)), is_admin = true
  where student_id = p_student_id
  returning * into v_student;

  if not found then
    raise exception '학번을 찾을 수 없습니다.';
  end if;

  return jsonb_build_object('student_id', v_student.student_id, 'name', v_student.name, 'is_admin', v_student.is_admin);
end;
$$;
revoke all on function public.student_admin_upgrade(text, text) from public;
grant execute on function public.student_admin_upgrade(text, text) to anon, authenticated;


-- ── 8) 관리자 공유 PIN 변경(SettingsTab.jsx) ───────────────────────────
-- app_settings.admin_password가 더는 anon SELECT로 안 읽히므로(§2), 현재 비밀번호
-- 대조까지 서버에서 처리. fcm_tokens 초기화는 기존처럼 프론트에서 별도 호출.
create or replace function public.admin_password_change(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  select value into v_current from app_settings where key = 'admin_password';
  if v_current is null or p_current <> v_current then
    raise exception '현재 비밀번호가 틀렸습니다' using errcode = '28P01';
  end if;
  update app_settings set value = p_new where key = 'admin_password';
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke all on function public.admin_password_change(text, text) from public;
grant execute on function public.admin_password_change(text, text) to anon, authenticated;
