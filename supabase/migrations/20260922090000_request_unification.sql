-- ════════════════════════════════════════════════════════════════════════
-- Reagent Detail Request UX Unification — 위치 변경 / 시약정보 수정 / 폐기 요청 3종의 상태 의미 통일.
--
-- ⚠️ staging에만 적용. production 미적용.
--
-- 공통 의미:  학생 신청 → pending(관리자 검토 대기, 실제 master/Lot 불변)
--             관리자 승인 → 실제 반영 + 이력(한 트랜잭션)      관리자 반려 → 실제 변화 0 + 반려 사유 기록
-- 폐기(업무 규칙 확정): 신청 완료 ≠ 폐기 완료. 관리자 "승인" = 즉시 실제 폐기 완료(status 'disposed').
--   별도 "폐기 완료" 2차 단계 없음. → disposal_request_review 는 approve / reject 두 액션만.
--   (예전에 있던 approve(상태만) → complete(2단계) / approve_and_zero_lot / dispose_lot 은 제거)
--   과거 2단계 흐름의 잔재('approved' 상태 행)는 approve 한 번으로 마무리한다(production엔 0건).
-- 중복 규칙(기존 BulkEdit 의 "이미 대기중인 Lot 은 다시 신청 불가" 의도를 서버로 이동):
--   같은 Lot 의 pending 폐기 1개 / 같은 Lot 의 pending 위치이동 1개 / 같은 시약·항목의 pending 수정 1개.
--   과거 approved/rejected/disposed 행은 새 신청을 막지 않는다. (종류 간 교차 제한은 두지 않음 — 보고서 참조)
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) 반려 사유 컬럼 + pending 중복 방지 유일 인덱스 ─────────────────────────
alter table public.disposal_requests add column if not exists review_note text;
alter table public.reagent_change_requests add column if not exists review_note text;
alter table public.location_requests add column if not exists review_note text;

create unique index if not exists disposal_requests_one_pending_per_lot
  on public.disposal_requests (lot_id) where status = 'pending' and lot_id is not null;
create unique index if not exists location_requests_one_pending_per_lot
  on public.location_requests (lot_id) where status = 'pending' and lot_id is not null;
create unique index if not exists reagent_change_requests_one_pending_per_field
  on public.reagent_change_requests (reagent_id, field_name) where status = 'pending';


-- ── 2) 학생 제출 RPC — 중복 pending / 유효하지 않은 대상 차단 ────────────────────
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
  v_lot public.reagent_lots%rowtype;
  v_id uuid;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_student_name from public.students where student_id = v_student_id;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception '폐기 사유를 입력해주세요.';
  end if;
  if p_lot_id is not null then
    select * into v_lot from public.reagent_lots where id = p_lot_id;
    if found and v_lot.status <> 'active' then
      raise exception '이미 폐기·사용완료·분실 처리된 Lot이라 폐기 신청할 수 없습니다.';
    end if;
    if exists (select 1 from public.disposal_requests where lot_id = p_lot_id and status = 'pending') then
      raise exception '이 Lot은 이미 폐기 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
    end if;
  end if;

  begin
    insert into public.disposal_requests (
      reagent_id, lot_id, reagent_name, lot_no, quantity, reason,
      requested_by, requested_by_student_id, status
    ) values (
      p_reagent_id, p_lot_id, p_reagent_name, p_lot_no, p_quantity, p_reason,
      v_student_name, v_student_id, 'pending'
    ) returning id into v_id;
  exception when unique_violation then
    raise exception '이 Lot은 이미 폐기 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name, 'requested_by_student_id', v_student_id);
end;
$$;
revoke all on function public.disposal_request_submit(text, uuid, uuid, text, text, text, text) from public;
grant execute on function public.disposal_request_submit(text, uuid, uuid, text, text, text, text) to anon, authenticated;

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
  select name into v_student_name from public.students where student_id = v_student_id;

  if p_field_name is null or length(trim(p_field_name)) = 0 then
    raise exception '수정할 항목이 지정되지 않았습니다.';
  end if;
  if p_new_value is null then
    raise exception '새 값이 없습니다.';
  end if;
  if not exists (select 1 from public.reagents where id = p_reagent_id) then
    raise exception '존재하지 않는 시약입니다.';
  end if;
  if exists (select 1 from public.reagent_change_requests where reagent_id = p_reagent_id and field_name = p_field_name and status = 'pending') then
    raise exception '이 항목은 이미 수정 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end if;

  begin
    insert into public.reagent_change_requests (
      reagent_id, field_name, old_value, new_value, requested_by, requested_by_student_id, status
    ) values (
      p_reagent_id, p_field_name, p_old_value, p_new_value, v_student_name, v_student_id, 'pending'
    ) returning id into v_id;
  exception when unique_violation then
    raise exception '이 항목은 이미 수정 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name, 'requested_by_student_id', v_student_id);
end;
$$;
revoke all on function public.reagent_change_request_submit(text, uuid, text, text, text) from public;
grant execute on function public.reagent_change_request_submit(text, uuid, text, text, text) to anon, authenticated;

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
  v_lot public.reagent_lots%rowtype;
  v_id uuid;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_student_name from public.students where student_id = v_student_id;

  if p_to_location_id is null then
    raise exception '이동할 위치가 지정되지 않았습니다.';
  end if;
  if p_lot_id is not null then
    select * into v_lot from public.reagent_lots where id = p_lot_id;
    if found then
      if v_lot.status <> 'active' then raise exception '이미 폐기·사용완료·분실 처리된 Lot이라 위치 변경 신청할 수 없습니다.'; end if;
      if v_lot.location_id is not distinct from p_to_location_id then raise exception '현재 위치와 같습니다.'; end if;
    end if;
    if exists (select 1 from public.location_requests where lot_id = p_lot_id and status = 'pending') then
      raise exception '이 Lot은 이미 위치 변경 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
    end if;
  end if;

  begin
    insert into public.location_requests (
      reagent_id, lot_id, reagent_name, from_location_id, from_location_name,
      to_location_id, to_location_name, requested_by, notes, status
    ) values (
      p_reagent_id, p_lot_id, p_reagent_name, p_from_location_id, p_from_location_name,
      p_to_location_id, p_to_location_name, v_student_name, p_notes, 'pending'
    ) returning id into v_id;
  exception when unique_violation then
    raise exception '이 Lot은 이미 위치 변경 신청이 접수되어 관리자 검토 대기 중입니다.' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_name);
end;
$$;
revoke all on function public.location_request_submit(text, uuid, uuid, text, uuid, text, uuid, text, text) from public;
grant execute on function public.location_request_submit(text, uuid, uuid, text, uuid, text, uuid, text, text) to anon, authenticated;


-- ── 3) 관리자 review RPC ────────────────────────────────────────────────────
-- 시약정보 수정: 반려 사유 저장(나머지는 기존과 동일)
create or replace function public.reagent_change_request_review(
  p_request_id uuid, p_decision text, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_req public.reagent_change_requests%rowtype;
  v_type text;
  v_val text;
  v_now timestamptz := now();
  v_rname text;
  v_rows int;
  v_allowed text[] := array['name','name_ko','cas_no','company','purity','volume','unit','category','manager','msds_url','notes','hazard'];
begin
  v_actor := public._admin_actor();
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception '알 수 없는 처리 방식입니다.';
  end if;

  select * into v_req from public.reagent_change_requests where id = p_request_id for update;
  if not found then raise exception '존재하지 않는 변경 요청입니다.'; end if;
  if v_req.status <> 'pending' then
    raise exception '이미 처리된 요청입니다. (현재 상태: %)', v_req.status using errcode = '55000';
  end if;

  select name into v_rname from public.reagents where id = v_req.reagent_id;

  if p_decision = 'approve' then
    if not (v_req.field_name = any (v_allowed)) then
      raise exception '변경할 수 없는 항목입니다: %', v_req.field_name;
    end if;
    select format_type(a.atttypid, a.atttypmod) into v_type
      from pg_attribute a
     where a.attrelid = 'public.reagents'::regclass and a.attname = v_req.field_name and not a.attisdropped;
    if v_type is null then raise exception '시약 테이블에 없는 항목입니다: %', v_req.field_name; end if;
    v_val := case when v_type = 'text' or v_type like 'character%' then v_req.new_value else nullif(v_req.new_value, '') end;
    execute format('update public.reagents set %I = $1::%s, last_confirmed_at = $2, confirmed_by = null where id = $3', v_req.field_name, v_type)
      using v_val, v_now, v_req.reagent_id;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception '대상 시약이 존재하지 않습니다.'; end if;

    update public.reagent_change_requests
       set status = 'approved', approved_by = v_actor, approved_by_student_id = null, approved_at = v_now
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '시약정보 수정 승인', 'reagent',
              coalesce(v_rname, '') || ' ' || v_req.field_name || ': "' || coalesce(v_req.old_value, '') || '" → "' || v_req.new_value || '"');
  else
    update public.reagent_change_requests
       set status = 'rejected', approved_by = v_actor, approved_by_student_id = null, approved_at = v_now,
           review_note = nullif(trim(p_reason), '')
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '시약정보 수정 반려', 'reagent',
              coalesce(v_rname, '') || ' ' || v_req.field_name || coalesce(' (사유: ' || nullif(trim(p_reason), '') || ')', ''));
  end if;

  return jsonb_build_object('id', p_request_id, 'status', case p_decision when 'approve' then 'approved' else 'rejected' end, 'reviewed_by', v_actor);
end;
$$;
revoke all on function public.reagent_change_request_review(uuid, text, text) from public, anon;
grant execute on function public.reagent_change_request_review(uuid, text, text) to authenticated;

-- 위치 변경: 폐기/사용완료된 Lot 은 이동 불가 + 반려 사유 저장
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
  v_now timestamptz := now();
  v_moved int := 0;
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
    if v_req.to_location_id is null or not exists (select 1 from public.locations where id = v_req.to_location_id) then
      raise exception '이동할 위치가 존재하지 않습니다.';
    end if;
    for v_lot in
      select * from public.reagent_lots
       where case when v_req.lot_id is not null then id = v_req.lot_id
                  else reagent_id = v_req.reagent_id and status = 'active' end
       order by id for update
    loop
      if v_lot.status <> 'active' then
        raise exception '이미 폐기·사용완료·분실 처리된 Lot이라 이동할 수 없습니다. 이 요청은 반려해주세요.';
      end if;
      update public.reagent_lots set location_id = v_req.to_location_id where id = v_lot.id;
      insert into public.location_history (
        reagent_id, lot_id, reagent_name, from_location_id, from_location_name,
        to_location_id, to_location_name, moved_by, notes
      ) values (
        v_lot.reagent_id, v_lot.id, v_req.reagent_name,
        case when v_req.lot_id is not null then v_req.from_location_id else v_lot.location_id end,
        case when v_req.lot_id is not null then v_req.from_location_name else public._location_label(v_lot.location_id, ' - ') end,
        v_req.to_location_id, v_req.to_location_name, v_actor, '신청자: ' || coalesce(v_req.requested_by, '')
      );
      v_moved := v_moved + 1;
    end loop;
    if v_moved = 0 then raise exception '이동할 Lot이 없습니다.'; end if;

    update public.location_requests
       set status = 'approved', approved_by = v_actor, approved_at = v_now
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '위치 변경 승인', 'reagent',
              coalesce(v_req.reagent_name, '') || ': ' || coalesce(v_req.from_location_name, '') || ' → ' || coalesce(v_req.to_location_name, ''));
  else
    update public.location_requests
       set status = 'rejected', approved_by = v_actor, approved_at = v_now, review_note = nullif(trim(p_reason), '')
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '위치 변경 반려', 'reagent',
              coalesce(v_req.reagent_name, '') || coalesce(' (사유: ' || nullif(trim(p_reason), '') || ')', ''));
  end if;

  return jsonb_build_object('id', p_request_id, 'status', case p_decision when 'approve' then 'approved' else 'rejected' end,
                            'reviewed_by', v_actor, 'lots_moved', v_moved);
end;
$$;
revoke all on function public.location_request_review(uuid, text, text) from public, anon;
grant execute on function public.location_request_review(uuid, text, text) to authenticated;

-- 폐기: approve = 즉시 실제 폐기 완료(status 'disposed'), reject = 실제 변화 0. 두 액션뿐.
-- Lot 폐기 방식: 신청 수량이 "정수 n" 이고 그 Lot 에 미개봉 병이 n보다 많이(>1) 있으면 n병만 차감(Lot 은 active 유지),
-- 그 외(전체/단일 병/개봉병 등)는 Lot 전체 폐기(sealed 0, stock 0, status disposed).
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
  v_lot_id uuid;
  v_now timestamptz := now();
  v_today date := current_date;
  v_active_n int;
  v_qty int;
  v_mode text := null;
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
    v_lot_id := v_req.lot_id;
    if v_lot_id is null then
      select count(*), min(id::text)::uuid into v_active_n, v_lot_id
        from public.reagent_lots where reagent_id = v_req.reagent_id and status = 'active';
      if v_active_n <> 1 then raise exception 'Lot이 지정되지 않은 신청이라 자동 처리할 수 없습니다. 반려 후 Lot을 지정해 다시 신청해주세요.'; end if;
    end if;
    select * into v_lot from public.reagent_lots where id = v_lot_id for update;
    if not found then raise exception '대상 Lot이 존재하지 않습니다.'; end if;
    if v_lot.status <> 'active' then
      raise exception '이미 폐기·사용완료·분실 처리된 Lot입니다. 이 요청은 반려해주세요. (현재: %)', v_lot.status;
    end if;

    v_qty := case when v_req.quantity ~ '^\s*[0-9]+\s*$' then trim(v_req.quantity)::int else null end;
    if v_qty is not null and v_qty >= 1 and v_lot.sealed_count > 1 and v_qty < v_lot.sealed_count then
      update public.reagent_lots
         set sealed_count = sealed_count - v_qty, disposal_date = v_today, needs_review = false
       where id = v_lot_id;
      v_mode := 'partial';
    else
      update public.reagent_lots
         set sealed_count = 0, current_stock = 0, status = 'disposed', disposal_date = v_today, needs_review = false
       where id = v_lot_id;
      v_mode := 'full';
    end if;

    update public.disposal_requests
       set status = 'disposed', approved_by = v_actor, approved_by_student_id = null, approved_at = v_now, disposed_at = v_now
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '폐기 승인(폐기 완료)', 'disposal', coalesce(v_req.reagent_name, '') || ' · Lot ' || coalesce(v_lot.lot_no, '-') || ' · ' || v_mode);
    return jsonb_build_object('id', p_request_id, 'status', 'disposed', 'reviewed_by', v_actor, 'disposal', v_mode);
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
