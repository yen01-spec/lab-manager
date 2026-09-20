-- ════════════════════════════════════════════════════════════════════════
-- 병 단위 요청 통일 — 폐기 / 위치 이동 요청의 대상은 항상 "reagent_lots.id 1행 = 실물 병 1개".
--
-- ⚠️ staging에만 적용. production 미적용.
--
-- 데이터 모델(실측): reagent_lots 1행 = 병 1개. lot_no 는 제조사 배치 번호(같은 reagent 에 같은 lot_no 여러 행 가능) → 병 식별키가 아니다.
--   (sealed_count 컬럼은 존재하지만 production 실측에서 모든 행이 0 또는 1 — 여러 병을 한 행에 묶은 행은 0건)
-- 변경:
--   1) 제출 RPC 는 lot_id 필수. reagent_id / 시약명 / lot_no / 기존 위치는 서버가 reagent_lots 에서 다시 읽어 저장(client 값 불신).
--   2) disposal_request_submit 에서 수량(p_quantity) 제거. 폐기 = 그 병 1개 폐기(승인 시 즉시 폐기 완료).
--   3) disposal_request_review: 수량 기반 "n병 차감 / Lot 유지" 분기 제거. 대상은 요청의 lot_id 1행뿐(reagent 단위 fallback 제거).
--   4) location_request_review: lot_id 필수(reagent 단위 fallback 제거), 승인 직전 재검증 — 병 존재/reagent 일치/active/
--      현재 위치가 요청 시점 위치와 같은지(stale 이면 명확한 오류) / 이미 목적지가 아닌지. location_history 는 그 병 1건.
--   5) admin_dispose_lots 는 disposal_requests.quantity 를 더 이상 채우지 않는다(과거 행의 컬럼은 이력으로 유지).
-- 종류 간 교차 pending 제한은 만들지 않는다 — 나중 승인은 그 시점의 병 상태로 서버가 다시 검증해 실패/통과한다.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) 학생 제출 RPC ─────────────────────────────────────────────────────────
drop function if exists public.disposal_request_submit(text, uuid, uuid, text, text, text, text);
create or replace function public.disposal_request_submit(
  p_session_token text, p_lot_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_student_name text;
  v_lot public.reagent_lots%rowtype;
  v_name text;
  v_id uuid;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_student_name from public.students where student_id = v_student_id;

  if p_lot_id is null then raise exception '폐기할 병(Lot)을 선택해주세요.'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception '폐기 사유를 입력해주세요.';
  end if;
  select * into v_lot from public.reagent_lots where id = p_lot_id;
  if not found then raise exception '존재하지 않는 병(Lot)입니다.'; end if;
  if v_lot.status <> 'active' then
    raise exception '이미 폐기·사용완료·분실 처리된 병이라 폐기 신청할 수 없습니다.';
  end if;
  if exists (select 1 from public.disposal_requests where lot_id = p_lot_id and status = 'pending') then
    raise exception '이 병은 이미 폐기 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end if;
  select name into v_name from public.reagents where id = v_lot.reagent_id;

  begin
    insert into public.disposal_requests (
      reagent_id, lot_id, reagent_name, lot_no, quantity, reason,
      requested_by, requested_by_student_id, status
    ) values (
      v_lot.reagent_id, v_lot.id, v_name, v_lot.lot_no, null, p_reason,
      v_student_name, v_student_id, 'pending'
    ) returning id into v_id;
  exception when unique_violation then
    raise exception '이 병은 이미 폐기 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name, 'requested_by_student_id', v_student_id);
end;
$$;
revoke all on function public.disposal_request_submit(text, uuid, text) from public;
grant execute on function public.disposal_request_submit(text, uuid, text) to anon, authenticated;

drop function if exists public.location_request_submit(text, uuid, uuid, text, uuid, text, uuid, text, text);
create or replace function public.location_request_submit(
  p_session_token text, p_lot_id uuid, p_to_location_id uuid, p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_student_name text;
  v_lot public.reagent_lots%rowtype;
  v_name text;
  v_id uuid;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_student_name from public.students where student_id = v_student_id;

  if p_lot_id is null then raise exception '위치를 바꿀 병(Lot)을 선택해주세요.'; end if;
  if p_to_location_id is null then raise exception '이동할 위치가 지정되지 않았습니다.'; end if;
  if not exists (select 1 from public.locations where id = p_to_location_id) then
    raise exception '이동할 위치가 존재하지 않습니다.';
  end if;
  select * into v_lot from public.reagent_lots where id = p_lot_id;
  if not found then raise exception '존재하지 않는 병(Lot)입니다.'; end if;
  if v_lot.status <> 'active' then raise exception '이미 폐기·사용완료·분실 처리된 병이라 위치 변경 신청할 수 없습니다.'; end if;
  if v_lot.location_id is not distinct from p_to_location_id then raise exception '현재 위치와 같습니다.'; end if;
  if exists (select 1 from public.location_requests where lot_id = p_lot_id and status = 'pending') then
    raise exception '이 병은 이미 위치 변경 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end if;
  select name into v_name from public.reagents where id = v_lot.reagent_id;

  begin
    insert into public.location_requests (
      reagent_id, lot_id, reagent_name, from_location_id, from_location_name,
      to_location_id, to_location_name, requested_by, notes, status
    ) values (
      v_lot.reagent_id, v_lot.id, v_name, v_lot.location_id, public._location_label(v_lot.location_id, ' - '),
      p_to_location_id, public._location_label(p_to_location_id, ' - '), v_student_name, p_notes, 'pending'
    ) returning id into v_id;
  exception when unique_violation then
    raise exception '이 병은 이미 위치 변경 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name);
end;
$$;
revoke all on function public.location_request_submit(text, uuid, uuid, text) from public;
grant execute on function public.location_request_submit(text, uuid, uuid, text) to anon, authenticated;


-- ── 2) 관리자 review RPC ────────────────────────────────────────────────────
-- 위치 이동: 승인 = 요청의 lot_id 1행만 이동 + location_history 1건. 다른 병(같은 reagent / 같은 lot_no)은 불변.
create or replace function public.location_request_review(
  p_request_id uuid, p_decision text, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_req public.location_requests%rowtype;
  v_lot public.reagent_lots%rowtype;
  v_name text;
  v_now timestamptz := now();
begin
  v_actor := public._admin_actor();
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception '알 수 없는 처리 방식입니다.';
  end if;

  select * into v_req from public.location_requests where id = p_request_id for update;
  if not found then raise exception '존재하지 않는 위치 이동 요청입니다.'; end if;
  if v_req.status <> 'pending' then
    raise exception '이미 처리된 요청입니다. (현재 상태: %)', v_req.status using errcode = '55000';
  end if;

  if p_decision = 'approve' then
    if v_req.lot_id is null then
      raise exception '대상 병(Lot)이 지정되지 않은 요청이라 처리할 수 없습니다. 반려 후 병을 지정해 다시 신청해주세요.';
    end if;
    if v_req.to_location_id is null or not exists (select 1 from public.locations where id = v_req.to_location_id) then
      raise exception '이동할 위치가 존재하지 않습니다.';
    end if;
    select * into v_lot from public.reagent_lots where id = v_req.lot_id for update;
    if not found then raise exception '대상 병(Lot)이 존재하지 않습니다. 이 요청은 반려해주세요.'; end if;
    if v_req.reagent_id is distinct from v_lot.reagent_id then
      raise exception '요청 대상과 실제 병 정보가 일치하지 않습니다. 이 요청은 반려해주세요.';
    end if;
    if v_lot.status <> 'active' then
      raise exception '이미 폐기·사용완료·분실 처리된 병이라 이동할 수 없습니다. 이 요청은 반려해주세요. (현재: %)', v_lot.status;
    end if;
    if v_lot.location_id is not distinct from v_req.to_location_id then
      raise exception '이 병은 이미 요청한 위치에 있습니다. 이 요청은 반려해주세요.';
    end if;
    if v_lot.location_id is distinct from v_req.from_location_id then
      raise exception '요청 이후 이 병의 위치가 이미 바뀌었습니다. (요청 시점: %, 현재: %) 이 요청은 반려하고 다시 신청해주세요.',
        coalesce(v_req.from_location_name, public._location_label(v_req.from_location_id, ' - ')),
        public._location_label(v_lot.location_id, ' - ');
    end if;

    select name into v_name from public.reagents where id = v_lot.reagent_id;
    update public.reagent_lots set location_id = v_req.to_location_id where id = v_lot.id;
    insert into public.location_history (
      reagent_id, lot_id, reagent_name, from_location_id, from_location_name,
      to_location_id, to_location_name, moved_by, notes
    ) values (
      v_lot.reagent_id, v_lot.id, v_name, v_lot.location_id, public._location_label(v_lot.location_id, ' - '),
      v_req.to_location_id, public._location_label(v_req.to_location_id, ' - '), v_actor, '신청자: ' || coalesce(v_req.requested_by, '')
    );

    update public.location_requests
       set status = 'approved', approved_by = v_actor, approved_at = v_now
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '위치 변경 승인', 'reagent',
              coalesce(v_name, '') || ' · Lot ' || coalesce(v_lot.lot_no, '-') || ': ' ||
              public._location_label(v_lot.location_id, ' - ') || ' → ' || public._location_label(v_req.to_location_id, ' - '));
  else
    update public.location_requests
       set status = 'rejected', approved_by = v_actor, approved_at = v_now, review_note = nullif(trim(p_reason), '')
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '위치 변경 반려', 'reagent',
              coalesce(v_req.reagent_name, '') || coalesce(' (사유: ' || nullif(trim(p_reason), '') || ')', ''));
  end if;

  return jsonb_build_object('id', p_request_id, 'status', case p_decision when 'approve' then 'approved' else 'rejected' end,
                            'reviewed_by', v_actor, 'lots_moved', case p_decision when 'approve' then 1 else 0 end);
end;
$$;
revoke all on function public.location_request_review(uuid, text, text) from public, anon;
grant execute on function public.location_request_review(uuid, text, text) to authenticated;

-- 폐기: approve = 요청의 lot_id 1행(=병 1개)만 즉시 폐기 완료(status 'disposed'), reject = 실제 변화 0. 수량 분기 없음.
create or replace function public.disposal_request_review(
  p_request_id uuid, p_action text, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_req public.disposal_requests%rowtype;
  v_lot public.reagent_lots%rowtype;
  v_name text;
  v_now timestamptz := now();
begin
  v_actor := public._admin_actor();
  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception '알 수 없는 처리 방식입니다.';
  end if;

  select * into v_req from public.disposal_requests where id = p_request_id for update;
  if not found then raise exception '존재하지 않는 폐기 신청입니다.'; end if;
  -- 'approved' 는 예전 2단계 흐름의 잔재(승인만 되고 폐기 미완료) — 한 번 더 승인/반려로 마무리한다.
  if v_req.status not in ('pending', 'approved') then
    raise exception '이미 처리된 요청입니다. (현재 상태: %)', v_req.status using errcode = '55000';
  end if;

  if p_action = 'approve' then
    if v_req.lot_id is null then
      raise exception '대상 병(Lot)이 지정되지 않은 신청이라 처리할 수 없습니다. 반려 후 병을 지정해 다시 신청해주세요.';
    end if;
    select * into v_lot from public.reagent_lots where id = v_req.lot_id for update;
    if not found then raise exception '대상 병(Lot)이 존재하지 않습니다. 이 요청은 반려해주세요.'; end if;
    if v_req.reagent_id is distinct from v_lot.reagent_id then
      raise exception '요청 대상과 실제 병 정보가 일치하지 않습니다. 이 요청은 반려해주세요.';
    end if;
    if v_lot.status <> 'active' then
      raise exception '이미 폐기·사용완료·분실 처리된 병입니다. 이 요청은 반려해주세요. (현재: %)', v_lot.status;
    end if;
    if v_lot.sealed_count > 1 then
      raise exception '이 Lot 행에는 미개봉 병 %개가 함께 묶여 있어 병 1개 단위로 폐기할 수 없습니다. 재고를 병 단위로 정리한 뒤 처리해주세요.', v_lot.sealed_count;
    end if;

    update public.reagent_lots
       set sealed_count = 0, current_stock = 0, status = 'disposed', disposal_date = current_date, needs_review = false
     where id = v_lot.id;
    update public.disposal_requests
       set status = 'disposed', approved_by = v_actor, approved_by_student_id = null, approved_at = v_now, disposed_at = v_now
     where id = p_request_id;
    select name into v_name from public.reagents where id = v_lot.reagent_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '폐기 승인(폐기 완료)', 'disposal', coalesce(v_name, '') || ' · Lot ' || coalesce(v_lot.lot_no, '-') || ' · 병 1개');
    return jsonb_build_object('id', p_request_id, 'status', 'disposed', 'reviewed_by', v_actor, 'lot_id', v_lot.id);
  end if;

  update public.disposal_requests
     set status = 'rejected', approved_by = v_actor, approved_by_student_id = null, approved_at = v_now, review_note = nullif(trim(p_reason), '')
   where id = p_request_id;
  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '폐기 반려', 'disposal', coalesce(v_req.reagent_name, '') || coalesce(' (사유: ' || nullif(trim(p_reason), '') || ')', ''));
  return jsonb_build_object('id', p_request_id, 'status', 'rejected', 'reviewed_by', v_actor);
end;
$$;
revoke all on function public.disposal_request_review(uuid, text, text) from public, anon;
grant execute on function public.disposal_request_review(uuid, text, text) to authenticated;

-- 관리자 직접 폐기(일괄정리/상세): 이력 행에 수량을 채우지 않는다(병 1개 = 1행).
create or replace function public.admin_dispose_lots(p_lot_ids uuid[], p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_lot record;
  v_n int := 0;
  v_now timestamptz := now();
begin
  v_actor := public._admin_actor();
  if p_lot_ids is null or array_length(p_lot_ids, 1) is null then raise exception '폐기할 Lot이 없습니다.'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception '폐기 사유를 입력해주세요.'; end if;
  for v_lot in
    select l.id, l.reagent_id, l.lot_no, r.name as reagent_name
      from public.reagent_lots l join public.reagents r on r.id = l.reagent_id
     where l.id = any (p_lot_ids) and l.status = 'active'
     order by l.id for update of l
  loop
    insert into public.disposal_requests (reagent_id, lot_id, reagent_name, lot_no, quantity, reason,
                                          requested_by, status, disposed_at, approved_by, approved_at)
      values (v_lot.reagent_id, v_lot.id, v_lot.reagent_name, v_lot.lot_no, null, p_reason,
              v_actor, 'disposed', v_now, v_actor, v_now);
    update public.reagent_lots
       set sealed_count = 0, current_stock = 0, status = 'disposed', disposal_date = current_date, needs_review = false
     where id = v_lot.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception '폐기할 수 있는 활성 Lot이 없습니다.'; end if;
  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '시약 일괄정리 - 폐기처리', 'reagent', 'Lot ' || v_n || '개 폐기 (사유: ' || p_reason || ')');
  return jsonb_build_object('disposed', v_n);
end;
$$;
revoke all on function public.admin_dispose_lots(uuid[], text) from public, anon;
grant execute on function public.admin_dispose_lots(uuid[], text) to authenticated;
