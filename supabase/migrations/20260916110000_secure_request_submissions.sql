-- ════════════════════════════════════════════════════════════════════════
-- Phase S-RLS3 Domain Batch 1 — "일반 사용자가 제출하는 요청류" 중
-- session-token 신원 검증이 아직 없던 나머지 2개를 disposal_request_submit과
-- 동일한 패턴으로 전환한다: 시약 정보 수정 요청, 위치 이동 요청.
--
-- ⚠️ staging에만 적용, production 미적용.
--
-- 범위를 의도적으로 좁힘(Phase S-RLS3 §22): 아래는 이번 배치에서 다루지 않는다 —
--  - 재고실사(useInventorySession.js) 완료 시 reagents/reagent_lots 직접 반영 + 사후
--    change_request(status='approved') 생성 — "제출 후 승인 대기"가 아니라 "직접 반영 +
--    감사기록" 구조라 다른 domain. 일반 사용자가 실사 중 master를 직접 바꾸는 게 의도된
--    설계인지 별도 확인 필요.
--  - 구매요청(Requests.jsx의 purchase_requests) — user_name이 로그인 세션이 아니라 순수
--    자유입력 텍스트라 애초에 "세션 신원을 사칭"할 여지가 없음(주장하는 신원 자체가 없음).
--    책임추적성 문제이지 이번 Phase의 "세션 사칭" 문제와 성격이 다름.
--  - 구매요청서(PurchaseRequest.jsx의 purchase_request_logs/items) — 여러 테이블에 걸친
--    multi-row insert라 구조가 다름, 다음 배치에서.
--  - 관리자 승인/반려(ChangeRequestTab/MoveTab의 UPDATE) — 여전히 구(舊) trust model,
--    Supabase Auth 관리자 체계로의 전환은 별도 결정 필요(Phase S-RLS3 §24).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) 시약 정보 수정 요청 제출 ──────────────────────────────────────
create or replace function public.reagent_change_request_submit(
  p_session_token text, p_reagent_id uuid, p_field_name text, p_old_value text, p_new_value text
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

  if p_field_name is null or length(trim(p_field_name)) = 0 then
    raise exception '수정할 항목이 지정되지 않았습니다.';
  end if;
  if p_new_value is null then
    raise exception '새 값이 없습니다.';
  end if;
  if not exists (select 1 from reagents where id = p_reagent_id) then
    raise exception '존재하지 않는 시약입니다.';
  end if;

  insert into reagent_change_requests (
    reagent_id, field_name, old_value, new_value, requested_by, requested_by_student_id, status
  ) values (
    p_reagent_id, p_field_name, p_old_value, p_new_value, v_student_name, v_student_id, 'pending'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name, 'requested_by_student_id', v_student_id);
end;
$$;
revoke all on function public.reagent_change_request_submit(text, uuid, text, text, text) from public;
grant execute on function public.reagent_change_request_submit(text, uuid, text, text, text) to anon, authenticated;


-- ── 2) 위치 이동 요청 제출 ────────────────────────────────────────────
-- location_requests에는 requested_by_student_id 컬럼이 없다(production 실제 schema
-- 확인 완료) — requested_by(이름)만 서버에서 조회해 기록한다.
create or replace function public.location_request_submit(
  p_session_token text, p_reagent_id uuid, p_lot_id uuid, p_reagent_name text,
  p_from_location_id uuid, p_from_location_name text,
  p_to_location_id uuid, p_to_location_name text, p_notes text
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

  if p_to_location_id is null then
    raise exception '이동할 위치가 지정되지 않았습니다.';
  end if;

  insert into location_requests (
    reagent_id, lot_id, reagent_name, from_location_id, from_location_name,
    to_location_id, to_location_name, requested_by, notes, status
  ) values (
    p_reagent_id, p_lot_id, p_reagent_name, p_from_location_id, p_from_location_name,
    p_to_location_id, p_to_location_name, v_student_name, p_notes, 'pending'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name);
end;
$$;
revoke all on function public.location_request_submit(text, uuid, uuid, text, uuid, text, uuid, text, text) from public;
grant execute on function public.location_request_submit(text, uuid, uuid, text, uuid, text, uuid, text, text) to anon, authenticated;


-- ── 3) direct INSERT 차단 (§14 — frontend가 위 RPC로 완전히 전환된 뒤에만) ──────
-- SELECT/UPDATE는 그대로 열어둔다 — admin 승인/반려(ChangeRequestTab/MoveTab의 UPDATE,
-- 여전히 구 trust model)는 이번 배치 범위 밖이라 건드리지 않는다(Phase S-RLS3 §24 —
-- Supabase Auth 관리자 체계 전환은 별도 결정 필요). INSERT만 막는다 — 이제 유일한 쓰기
-- 경로는 위 SECURITY DEFINER RPC뿐이다(owner로 실행되어 이 RLS/ACL을 우회함).

-- reagent_change_requests: 기존에 RLS 자체가 꺼져 있었다(production 확인) — 켜고
-- SELECT/UPDATE만 허용.
alter table reagent_change_requests enable row level security;
drop policy if exists reagent_change_requests_read on reagent_change_requests;
create policy reagent_change_requests_read on reagent_change_requests
  for select to anon, authenticated using (true);
drop policy if exists reagent_change_requests_update on reagent_change_requests;
create policy reagent_change_requests_update on reagent_change_requests
  for update to anon, authenticated using (true);
revoke all on reagent_change_requests from anon, authenticated;
grant select, update on reagent_change_requests to anon, authenticated;

-- location_requests: 기존 "allow all" 통짜 정책을 SELECT/UPDATE로 좁힌다.
drop policy if exists "allow all" on location_requests;
drop policy if exists location_requests_read on location_requests;
create policy location_requests_read on location_requests
  for select to anon, authenticated using (true);
drop policy if exists location_requests_update on location_requests;
create policy location_requests_update on location_requests
  for update to anon, authenticated using (true);
revoke all on location_requests from anon, authenticated;
grant select, update on location_requests to anon, authenticated;
