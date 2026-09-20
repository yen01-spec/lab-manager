-- ════════════════════════════════════════════════════════════════════════
-- Master Finish Phase 1 — 관리자 요청 승인/반려를 Supabase Auth 관리자(public.is_admin())
-- 전용 SECURITY DEFINER RPC로 옮기고, 요청 테이블 3종의 direct 쓰기를 전부 닫는다.
--
-- ⚠️ staging에만 적용. production 미적용(관리자 Auth 계정이 생긴 뒤 별도 Gate에서 적용).
--
-- 권한 모델:
--   관리자 = Supabase Auth 사용자 + admin_users(active) → public.is_admin().
--   students.is_admin(구 UI 플래그)은 이 함수들의 인가 근거가 아니다.
--   승인자 이름은 client가 보내지 않는다 — 서버가 auth.uid()로 확정한다.
--
-- 이 파일이 기존 client 코드의 동작을 그대로 보존하는 방식:
--   * 변경요청 승인: reagents.<field>=<new_value>, last_confirmed_at 갱신(+요청 approved).
--   * 위치이동 승인: Lot 위치 변경 + location_history (Lot 미지정 오래된 신청은 활성 Lot 전부 이동).
--   * 폐기 — 기존 화면 3곳이 서로 다른 의미로 처리하고 있어(아래) 그 의미를 액션으로 각각 보존:
--       approve              (관리자>폐기관리 "승인")   pending→approved, Lot 불변
--       complete             (관리자>폐기관리 "폐기 완료") approved→disposed + Lot 차감/폐기
--       approve_and_zero_lot (홈 대기목록 "승인")       pending→approved + Lot 잔량 0(전체면 disposed)
--       dispose_lot          (시약상세 "폐기 확정")     pending→disposed + Lot 전체 폐기
--       reject                                          pending→rejected
--     → 세 화면의 "승인" 의미가 서로 다른 것은 업무 결정이 필요한 별개 이슈(보고서 참조).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0) 내부 헬퍼: 관리자 확인 + 승인자 표시명(서버 확정) ─────────────────────
create or replace function public._admin_actor()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  select coalesce(nullif(trim(au.note), ''), u.email, u.id::text)
    into v_name
    from auth.users u
    left join public.admin_users au on au.user_id = u.id
   where u.id = auth.uid();
  return coalesce(v_name, auth.uid()::text);
end;
$$;
revoke all on function public._admin_actor() from public, anon, authenticated;

create or replace function public._location_label(p_id uuid, p_sep text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.room || case when l.detail is not null and l.detail <> '' then p_sep || l.detail else '' end
       from public.locations l where l.id = p_id),
    '미지정');
$$;
revoke all on function public._location_label(uuid, text) from public, anon, authenticated;


-- ── 1) 시약 정보 변경 요청 승인/반려 ─────────────────────────────────────────
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
      values (v_actor, '변경 요청 승인', 'reagent',
              coalesce(v_rname, '') || ' ' || v_req.field_name || ': "' || coalesce(v_req.old_value, '') || '" → "' || v_req.new_value || '"');
  else
    update public.reagent_change_requests
       set status = 'rejected', approved_by = v_actor, approved_by_student_id = null, approved_at = v_now
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '변경 요청 반려', 'reagent',
              coalesce(v_rname, '') || ' ' || v_req.field_name || coalesce(' (사유: ' || nullif(p_reason, '') || ')', ''));
  end if;

  return jsonb_build_object('id', p_request_id, 'status', case p_decision when 'approve' then 'approved' else 'rejected' end, 'reviewed_by', v_actor);
end;
$$;
revoke all on function public.reagent_change_request_review(uuid, text, text) from public, anon;
grant execute on function public.reagent_change_request_review(uuid, text, text) to authenticated;


-- ── 2) 위치 이동 요청 승인/반려 ──────────────────────────────────────────────
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
  v_to_name text;
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
    -- 이동 대상: 요청에 Lot이 있으면 그 Lot 하나, 없으면(오래된 신청) 해당 시약의 활성 Lot 전부.
    for v_lot in
      select * from public.reagent_lots
       where case when v_req.lot_id is not null then id = v_req.lot_id
                  else reagent_id = v_req.reagent_id and status = 'active' end
       order by id for update
    loop
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
      values (v_actor, '위치 이동 승인', 'reagent',
              coalesce(v_req.reagent_name, '') || ': ' || coalesce(v_req.from_location_name, '') || ' → ' || coalesce(v_req.to_location_name, ''));
  else
    update public.location_requests
       set status = 'rejected', approved_by = v_actor, approved_at = v_now
     where id = p_request_id;
    insert into public.admin_logs (admin_name, action, target_type, description)
      values (v_actor, '위치 이동 반려', 'reagent',
              coalesce(v_req.reagent_name, '') || coalesce(' (사유: ' || nullif(p_reason, '') || ')', ''));
  end if;

  return jsonb_build_object('id', p_request_id, 'status', case p_decision when 'approve' then 'approved' else 'rejected' end,
                            'reviewed_by', v_actor, 'lots_moved', v_moved);
end;
$$;
revoke all on function public.location_request_review(uuid, text, text) from public, anon;
grant execute on function public.location_request_review(uuid, text, text) to authenticated;


-- ── 3) 폐기 요청 처리 ────────────────────────────────────────────────────────
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
  v_new_sealed int;
  v_status text;
  v_active_n int;
begin
  v_actor := public._admin_actor();
  if p_action is null or p_action not in ('approve', 'reject', 'complete', 'approve_and_zero_lot', 'dispose_lot') then
    raise exception '알 수 없는 처리 방식입니다.';
  end if;

  select * into v_req from public.disposal_requests where id = p_request_id for update;
  if not found then raise exception '존재하지 않는 폐기 신청입니다.'; end if;

  if p_action = 'complete' then
    if v_req.status <> 'approved' then
      raise exception '승인된 신청만 폐기 완료 처리할 수 있습니다. (현재 상태: %)', v_req.status using errcode = '55000';
    end if;
  elsif v_req.status <> 'pending' then
    raise exception '이미 처리된 요청입니다. (현재 상태: %)', v_req.status using errcode = '55000';
  end if;

  v_lot_id := v_req.lot_id;
  if p_action = 'dispose_lot' and v_lot_id is null then
    -- Lot 미지정 신청: 그 시약의 활성 Lot이 정확히 1개일 때만 대상으로 인정
    select count(*), min(id::text)::uuid into v_active_n, v_lot_id
      from public.reagent_lots where reagent_id = v_req.reagent_id and status = 'active';
    if v_active_n <> 1 then raise exception 'Lot이 지정되지 않은 신청이라 자동 처리할 수 없습니다.'; end if;
  end if;

  if p_action in ('complete', 'approve_and_zero_lot', 'dispose_lot') and v_lot_id is not null then
    select * into v_lot from public.reagent_lots where id = v_lot_id for update;
    if not found then raise exception '대상 Lot이 존재하지 않습니다.'; end if;

    if p_action = 'complete' then
      if v_req.quantity = '전체' then
        update public.reagent_lots
           set sealed_count = 0, current_stock = 0, status = 'disposed', disposal_date = v_today, needs_review = false
         where id = v_lot_id;
      else
        v_new_sealed := greatest(0, v_lot.sealed_count - 1);
        if v_new_sealed <= 0 and v_lot.current_stock <= 0 then
          update public.reagent_lots
             set sealed_count = v_new_sealed, current_stock = 0, status = 'disposed', disposal_date = v_today, needs_review = false
           where id = v_lot_id;
        else
          update public.reagent_lots
             set sealed_count = v_new_sealed, disposal_date = v_today, needs_review = false
           where id = v_lot_id;
        end if;
      end if;
    elsif p_action = 'approve_and_zero_lot' then
      if v_req.quantity = '전체' then
        update public.reagent_lots
           set sealed_count = 0, current_stock = 0, needs_review = false, status = 'disposed', disposal_date = v_today
         where id = v_lot_id;
      else
        update public.reagent_lots set sealed_count = 0, current_stock = 0, needs_review = false where id = v_lot_id;
      end if;
    else -- dispose_lot
      update public.reagent_lots
         set sealed_count = 0, current_stock = 0, status = 'disposed', disposal_date = v_today, needs_review = false
       where id = v_lot_id;
    end if;
  end if;

  v_status := case p_action
    when 'reject' then 'rejected'
    when 'complete' then 'disposed'
    when 'dispose_lot' then 'disposed'
    else 'approved' end;

  update public.disposal_requests
     set status = v_status,
         approved_by = case when p_action = 'complete' then approved_by else v_actor end,
         approved_by_student_id = case when p_action = 'complete' then approved_by_student_id else null end,
         approved_at = case when p_action = 'complete' then approved_at else v_now end,
         disposed_at = case when v_status = 'disposed' then v_now else disposed_at end
   where id = p_request_id;

  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor,
            case p_action when 'reject' then '폐기 반려' when 'complete' then '폐기 완료' when 'dispose_lot' then '폐기 확정' else '폐기 승인' end,
            'disposal',
            case p_action when 'reject' then '폐기 반려: ' || coalesce(v_req.reagent_name, '') || coalesce(' (사유: ' || nullif(p_reason, '') || ')', '')
                          when 'complete' then '폐기 완료: ' || coalesce(v_req.reagent_name, '')
                          else '폐기 승인: ' || coalesce(v_req.reagent_name, '') end);

  return jsonb_build_object('id', p_request_id, 'status', v_status, 'reviewed_by', v_actor);
end;
$$;
revoke all on function public.disposal_request_review(uuid, text, text) from public, anon;
grant execute on function public.disposal_request_review(uuid, text, text) to authenticated;


-- ── 4) 관리자 일괄정리(시약 일괄정리 탭의 관리자 분기) — 다건 위치이동 / 폐기 ─────────
create or replace function public.admin_move_lots(p_lot_ids uuid[], p_to_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_lot record;
  v_to_name text;
  v_n int := 0;
begin
  v_actor := public._admin_actor();
  if p_lot_ids is null or array_length(p_lot_ids, 1) is null then raise exception '이동할 Lot이 없습니다.'; end if;
  if not exists (select 1 from public.locations where id = p_to_location_id) then
    raise exception '이동할 위치가 존재하지 않습니다.';
  end if;
  v_to_name := public._location_label(p_to_location_id, ' - ');
  for v_lot in
    select l.id, l.reagent_id, l.location_id, r.name as reagent_name
      from public.reagent_lots l join public.reagents r on r.id = l.reagent_id
     where l.id = any (p_lot_ids) and l.status = 'active'
     order by l.id for update of l
  loop
    update public.reagent_lots set location_id = p_to_location_id where id = v_lot.id;
    insert into public.location_history (reagent_id, lot_id, reagent_name, from_location_id, from_location_name,
                                         to_location_id, to_location_name, moved_by)
      values (v_lot.reagent_id, v_lot.id, v_lot.reagent_name, v_lot.location_id,
              public._location_label(v_lot.location_id, ' · '), p_to_location_id, v_to_name, v_actor);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception '이동할 수 있는 활성 Lot이 없습니다.'; end if;
  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '시약 일괄정리 - 위치이동', 'reagent', 'Lot ' || v_n || '개 → ' || v_to_name);
  return jsonb_build_object('moved', v_n, 'to', v_to_name);
end;
$$;
revoke all on function public.admin_move_lots(uuid[], uuid) from public, anon;
grant execute on function public.admin_move_lots(uuid[], uuid) to authenticated;

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
      values (v_lot.reagent_id, v_lot.id, v_lot.reagent_name, v_lot.lot_no, '전체', p_reason,
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


-- ── 5) 요청 테이블 3종 — direct 쓰기 전면 차단(SELECT만 유지) ───────────────────
-- 이제 쓰기 경로는 오직: 학생 제출 RPC(세션 토큰) / 관리자 리뷰 RPC(Auth 관리자).
alter table public.disposal_requests enable row level security;
alter table public.reagent_change_requests enable row level security;
alter table public.location_requests enable row level security;

drop policy if exists "allow all" on public.disposal_requests;
drop policy if exists disposal_requests_read on public.disposal_requests;
create policy disposal_requests_read on public.disposal_requests for select to anon, authenticated using (true);

drop policy if exists reagent_change_requests_update on public.reagent_change_requests;
drop policy if exists location_requests_update on public.location_requests;

revoke all on public.disposal_requests, public.reagent_change_requests, public.location_requests from anon, authenticated;
grant select on public.disposal_requests, public.reagent_change_requests, public.location_requests to anon, authenticated;
