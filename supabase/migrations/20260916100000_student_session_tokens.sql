-- ════════════════════════════════════════════════════════════════════════
-- 일반 사용자 write를 서버 검증 가능한 신원에 묶기 (Phase S-RLS2, "B안").
--
-- ⚠️ staging에만 적용, production 미적용(운영 미적용, Gate 승인 후 별도 적용).
--
-- 배경(20260916090000이 고친 것과 별개 문제): 로그인 자체는 이제 안전하지만, 로그인
-- 이후 세션은 client localStorage의 {student_id, name, is_admin} 뿐이라 서버가 재검증할
-- 방법이 없었다. reagent_change_requests/disposal_requests/location_requests 등 100여
-- 곳의 write가 client가 보낸 student_id를 그대로 믿고 저장했다 — anon 키로 누구든
-- requested_by_student_id에 임의 값을 넣어 다른 사람 이름으로 신청을 남길 수 있었다.
--
-- 해법: 로그인 성공 시 예측 불가능한 opaque session token을 발급(DB에는 SHA-256 해시만
-- 저장), 이후 신원이 필요한 RPC는 전부 그 token을 받아 서버에서 student_id를 직접
-- 조회한다 — client가 별도로 student_id를 넘겨도 절대 신뢰하지 않는다.
--
-- 이번 migration은 인프라(세션 테이블 + 로그인 RPC 토큰 발급 + 검증 헬퍼)와, 실제
-- 적용 예시로 disposal_requests 제출 경로 1개만 RPC로 전환한다. 나머지 write 경로
-- (reagent_change_requests/location_requests/purchase_requests/stock_logs 등)는 같은
-- 패턴으로 후속 Phase에서 단계적으로 전환 예정 — 한 번에 다 바꾸지 않는다.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) 세션 테이블 ──────────────────────────────────────────────────────
-- anon/authenticated 누구도 직접 접근 못 한다(RLS enabled, policy 없음 = 전면 거부).
-- SECURITY DEFINER 함수만(owner=postgres) 읽고 쓴다.
create table if not exists student_sessions (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  student_id    text not null references students(student_id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
comment on table student_sessions is 'opaque session token(해시만 저장) — student_id 신원을 서버에서
  재검증하기 위한 테이블. anon/authenticated에 어떤 권한도 부여하지 않는다(RLS enabled,
  정책 없음). Phase S-RLS2(B안).';

alter table student_sessions enable row level security;
-- 의도적으로 select/insert/update/delete policy를 만들지 않는다 — RLS 기본값(거부)만
-- 적용, SECURITY DEFINER 함수(owner)만 접근 가능.

revoke all on student_sessions from anon, authenticated;

create index if not exists idx_student_sessions_token_hash on student_sessions(token_hash);
create index if not exists idx_student_sessions_student_id on student_sessions(student_id);


-- ── 2) 내부 헬퍼: token → student_id 해석(다른 SECURITY DEFINER 함수에서만 호출) ──
-- anon/authenticated에는 EXECUTE grant를 아예 주지 않는다 — 외부에서 직접 호출 불가,
-- 오직 같은 owner(postgres)의 다른 SECURITY DEFINER 함수 안에서만 호출된다.
create or replace function public._resolve_student_session(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_student_id text;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception '세션이 유효하지 않습니다. 다시 로그인해주세요.' using errcode = '28000';
  end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select student_id into v_student_id
  from student_sessions
  where token_hash = v_hash and revoked_at is null and expires_at > now();

  if v_student_id is null then
    raise exception '세션이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.' using errcode = '28000';
  end if;

  update student_sessions
  set last_seen_at = now(), expires_at = now() + interval '30 days'
  where token_hash = v_hash;

  return v_student_id;
end;
$$;
revoke all on function public._resolve_student_session(text) from public, anon, authenticated;


-- ── 3) 세션 발급 헬퍼(로그인 RPC들이 공통으로 사용) ─────────────────────
create or replace function public._issue_student_session(p_student_id text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into student_sessions (token_hash, student_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), p_student_id, now() + interval '30 days');
  return v_token;
end;
$$;
revoke all on function public._issue_student_session(text) from public, anon, authenticated;


-- ── 4) 로그인 RPC들이 이제 session_token도 함께 발급 ────────────────────
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
  v_token text;
begin
  select * into v_student from students where student_id = p_student_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_student.name <> p_name or v_student.birth_date <> p_birth_date then
    return jsonb_build_object('status', 'mismatch');
  end if;
  v_token := public._issue_student_session(v_student.student_id);
  return jsonb_build_object('status', 'ok', 'student_id', v_student.student_id, 'name', v_student.name,
    'is_admin', false, 'session_token', v_token);
end;
$$;

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
  v_token text;
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
  v_token := public._issue_student_session(v_student.student_id);
  return jsonb_build_object('status', 'ok', 'student_id', v_student.student_id, 'name', v_student.name,
    'is_admin', v_student.is_admin, 'session_token', v_token);
end;
$$;

create or replace function public.student_register(
  p_student_id text, p_name text, p_birth_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if exists (select 1 from students where student_id = p_student_id) then
    raise exception '이미 등록된 학번입니다.' using errcode = '23505';
  end if;
  insert into students (student_id, name, birth_date) values (p_student_id, p_name, p_birth_date);
  v_token := public._issue_student_session(p_student_id);
  return jsonb_build_object('student_id', p_student_id, 'name', p_name, 'is_admin', false, 'session_token', v_token);
end;
$$;


-- ── 5) 세션 재확인 — 이제 student_id가 아니라 token을 받는다(과거 시그니처는
--     "아무 student_id나 넣으면 그 사람의 is_admin을 알려주는" 취약점이 있었다) ──
drop function if exists public.student_session_refresh(text);
create or replace function public.student_session_refresh(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_student students%rowtype;
begin
  begin
    v_student_id := public._resolve_student_session(p_session_token);
  exception when others then
    return jsonb_build_object('status', 'invalid_session');
  end;
  select * into v_student from students where student_id = v_student_id;
  if not found then
    return jsonb_build_object('status', 'invalid_session');
  end if;
  return jsonb_build_object('status', 'ok', 'student_id', v_student.student_id, 'name', v_student.name,
    'is_admin', v_student.is_admin, 'session_token', p_session_token);
end;
$$;
grant execute on function public.student_session_refresh(text) to anon, authenticated;


-- ── 6) 로그아웃 ─────────────────────────────────────────────────────────
create or replace function public.student_logout(p_session_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update student_sessions
  set revoked_at = now()
  where token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex');
end;
$$;
revoke all on function public.student_logout(text) from public;
grant execute on function public.student_logout(text) to anon, authenticated;


-- ── 7) 실제 적용 예시 — 폐기신청 제출(disposal_requests INSERT)을 신원-검증 RPC로.
--     requested_by/requested_by_student_id를 client에서 받지 않고 서버가 토큰으로
--     직접 조회 — client가 다른 값을 보내도 무시된다.
create or replace function public.disposal_request_submit(
  p_session_token text, p_reagent_id uuid, p_lot_id uuid,
  p_reagent_name text, p_lot_no text, p_quantity text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_student_name text;
  v_id uuid;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_student_name from students where student_id = v_student_id;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception '폐기 사유를 입력해주세요.';
  end if;

  insert into disposal_requests (
    reagent_id, lot_id, reagent_name, lot_no, quantity, reason,
    requested_by, requested_by_student_id, status
  ) values (
    p_reagent_id, p_lot_id, p_reagent_name, p_lot_no, p_quantity, p_reason,
    v_student_name, v_student_id, 'pending'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name, 'requested_by_student_id', v_student_id);
end;
$$;
revoke all on function public.disposal_request_submit(text, uuid, uuid, text, text, text, text) from public;
grant execute on function public.disposal_request_submit(text, uuid, uuid, text, text, text, text) to anon, authenticated;
-- anon도 실행은 가능하지만(로그인 자체가 anon 키 위에서 동작하는 구조라 어쩔 수 없음),
-- 함수 안의 _resolve_student_session()이 유효한 session_token 없이는 즉시 거부한다 —
-- 즉 "로그인하지 않은 상태로 신청 위조"는 불가능하다. client가 reagent_id/lot_id를 조작해
-- 존재하지 않는 값을 넣는 것 자체는 FK 위반으로 걸러진다(reagent_id는 nullable FK 없음
-- 주의 — 기존 disposal_requests 스키마 그대로, 이번 Phase에서 FK 추가 안 함).
