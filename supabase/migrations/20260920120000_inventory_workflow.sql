-- ════════════════════════════════════════════════════════════════════════
-- Master Finish Phase 2 — 재고실사 workflow 를 "임시저장 → 검토 → DB 최종 반영" 으로 확정하고
-- 모든 쓰기를 서버 RPC(학생=세션 토큰, 관리자=Supabase Auth is_admin())로 옮긴다.
--
-- ⚠️ staging에만 적용. production 미적용.
--
-- 업무 흐름(사용자 확정):
--   ① 학생 실사 입력           → inventory_counts 에 임시 저장
--   ② 학생 [완료](Lot 단위)     → 시약목록에 실사값 표시(미확정 배경색). reagents/reagent_lots 장부는 그대로
--   ③ 관리자 [실사 완료]        → 세션 status='reviewed'(검토/완료). 장부는 여전히 그대로, 목록엔 계속 실사값 표시
--   ④ 관리자 [DB 최종 반영]     → 한 트랜잭션으로 reagents/reagent_lots 변경 + stock_logs/location_history/
--                                 reagent_change_requests 이력 생성 + 세션 completed. 임시값 → 정식 장부값
--   (일시중단 paused / 취소 closed / 검토 취소 reviewed→active 가능. ③까지는 장부를 건드리지 않으므로
--    "완료 취소(되돌리기)" 로직 자체가 필요 없다.)
--
-- 예전 구현은 ③(완료 처리)에서 이미 장부를 바꾸고 pending_confirm 플래그로 표시한 뒤 ④는 플래그만
-- 끄는 방식이었다. 이 마이그레이션이 ④로 반영 시점을 옮긴다.
--
-- 신규 등록(학생이 실사 중 발견한 미등록 시약)만은 예외적으로 등록 즉시 reagents/reagent_lots 행이
-- 생기지만 pending_confirm=true(검토대기·미확정 표시)이며, ④에서 확정되고 취소 시 서버가 삭제한다.
--
-- inventory_assignments(구역 담당 배정)는 코드 어디에서도 쓰이지 않는 기능이라(구역 배정 기능 제거됨)
-- 학생 접근 범위는 "유효한 로그인 학생 + 진행 중(active) 세션"으로 검증한다.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0) 헬퍼 ─────────────────────────────────────────────────────────────
create or replace function public._inventory_open_session_check(p_session_id bigint, p_need text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from public.inventory_sessions where id = p_session_id;
  if v_status is null then raise exception '존재하지 않는 실사입니다.'; end if;
  if v_status <> p_need then
    raise exception '지금은 이 작업을 할 수 없는 실사 상태입니다. (현재: %)', v_status using errcode = '55000';
  end if;
end;
$$;
revoke all on function public._inventory_open_session_check(bigint, text) from public, anon, authenticated;


-- ── 1) 학생: 실사값 임시 저장(inventory_counts 만 변경) ───────────────────────
create or replace function public.inventory_count_save(p_session_token text, p_count_id bigint, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_name text;
  v_count public.inventory_counts%rowtype;
  v_key text;
  v_allowed text[] := array['actual_stock','actual_sealed','reported_missing','abnormal_note','staged_location_id','staged_reagent_fields','staged_lot_fields'];
  v_r_keys text[] := array['name','cas_no','company','hazard','category','volume','unit','purity'];
  v_l_keys text[] := array['cat_no','lot_no'];
  v_stock int; v_sealed int;
  v_staged jsonb;
  v_row public.inventory_counts%rowtype;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_name from public.students where student_id = v_student_id;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception '저장할 내용이 없습니다.'; end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    if not (v_key = any (v_allowed)) then raise exception '수정할 수 없는 항목입니다: %', v_key; end if;
  end loop;

  select * into v_count from public.inventory_counts where id = p_count_id for update;
  if not found then raise exception '존재하지 않는 실사 항목입니다.'; end if;
  perform public._inventory_open_session_check(v_count.session_id, 'active');

  if p_fields ? 'actual_stock' then
    v_stock := (p_fields->>'actual_stock')::int;
    if v_stock < 0 or v_stock > 100 then raise exception '잔량은 0~100 사이여야 합니다.'; end if;
    v_sealed := coalesce((p_fields->>'actual_sealed')::int, v_count.book_sealed, 0);
    if v_sealed < 0 then raise exception '미개봉 병 수가 올바르지 않습니다.'; end if;
    update public.inventory_counts
       set actual_stock = v_stock, actual_sealed = v_sealed,
           counted_by = v_name, counted_by_student_id = v_student_id, counted_at = now()
     where id = p_count_id;
  elsif p_fields ? 'actual_sealed' then
    raise exception 'actual_sealed 는 actual_stock 과 함께 저장해야 합니다.';
  end if;
  if p_fields ? 'reported_missing' then
    update public.inventory_counts set reported_missing = coalesce((p_fields->>'reported_missing')::boolean, false) where id = p_count_id;
  end if;
  if p_fields ? 'abnormal_note' then
    update public.inventory_counts set abnormal_note = nullif(trim(p_fields->>'abnormal_note'), '') where id = p_count_id;
  end if;
  if p_fields ? 'staged_location_id' then
    if nullif(p_fields->>'staged_location_id', '') is not null
       and not exists (select 1 from public.locations where id = (p_fields->>'staged_location_id')::uuid) then
      raise exception '존재하지 않는 위치입니다.';
    end if;
    update public.inventory_counts set staged_location_id = nullif(p_fields->>'staged_location_id', '')::uuid where id = p_count_id;
  end if;
  if p_fields ? 'staged_reagent_fields' then
    v_staged := p_fields->'staged_reagent_fields';
    if jsonb_typeof(v_staged) <> 'object' then raise exception 'staged_reagent_fields 형식 오류'; end if;
    for v_key in select jsonb_object_keys(v_staged) loop
      if not (v_key = any (v_r_keys)) then raise exception '수정할 수 없는 시약 항목입니다: %', v_key; end if;
    end loop;
    update public.inventory_counts set staged_reagent_fields = v_staged where id = p_count_id;
  end if;
  if p_fields ? 'staged_lot_fields' then
    v_staged := p_fields->'staged_lot_fields';
    if jsonb_typeof(v_staged) <> 'object' then raise exception 'staged_lot_fields 형식 오류'; end if;
    for v_key in select jsonb_object_keys(v_staged) loop
      if not (v_key = any (v_l_keys)) then raise exception '수정할 수 없는 Lot 항목입니다: %', v_key; end if;
    end loop;
    update public.inventory_counts set staged_lot_fields = v_staged where id = p_count_id;
  end if;

  select * into v_row from public.inventory_counts where id = p_count_id;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.inventory_count_save(text, bigint, jsonb) from public;
grant execute on function public.inventory_count_save(text, bigint, jsonb) to anon, authenticated;


-- ── 2) 학생: 실사 중 발견한 미등록 시약/Lot 등록(신규 등록만 즉시 행 생성, 미확정 표시) ──
create or replace function public.inventory_new_registration(
  p_session_token text, p_session_id bigint, p_reagent_id uuid, p_reagent jsonb, p_lot jsonb, p_abnormal_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_name text;
  v_reagent_id uuid := p_reagent_id;
  v_lot_id uuid;
  v_stock int;
  v_loc uuid;
  v_lot_no text;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_name from public.students where student_id = v_student_id;
  perform public._inventory_open_session_check(p_session_id, 'active');

  v_loc := nullif(p_lot->>'location_id', '')::uuid;
  if v_loc is null or not exists (select 1 from public.locations where id = v_loc) then
    raise exception '위치를 선택해주세요.';
  end if;
  v_stock := coalesce(nullif(p_lot->>'current_stock', '')::int, 0);
  if v_stock < 0 or v_stock > 100 then raise exception '잔량은 0~100 사이여야 합니다.'; end if;
  v_lot_no := nullif(trim(p_lot->>'lot_no'), '');

  if v_reagent_id is null then
    if p_reagent is null or nullif(trim(p_reagent->>'name'), '') is null then raise exception '화학물질명을 입력해주세요.'; end if;
    insert into public.reagents (name, purity, cas_no, company, category, volume, unit, reagent_type, status, registered_by, sort_letter, pending_confirm)
    values (trim(p_reagent->>'name'), nullif(p_reagent->>'purity', ''), nullif(p_reagent->>'cas_no', ''), nullif(p_reagent->>'company', ''),
            nullif(p_reagent->>'category', ''), nullif(p_reagent->>'volume', '')::numeric, nullif(p_reagent->>'unit', ''),
            'purchased', 'active', v_student_id, nullif(p_reagent->>'sort_letter', ''), true)
    returning id into v_reagent_id;
  elsif not exists (select 1 from public.reagents where id = v_reagent_id) then
    raise exception '존재하지 않는 시약입니다.';
  end if;

  insert into public.reagent_lots (reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock, location_id, status, pending_confirm)
  values (v_reagent_id, v_lot_no, case when v_lot_no is null then 'unspecified' else 'manufacturer' end,
          nullif(p_lot->>'cat_no', ''), 1, v_stock, v_loc, 'active', true)
  returning id into v_lot_id;

  insert into public.inventory_counts (
    session_id, reagent_id, lot_id, book_sealed, book_stock, book_status, book_location_id,
    actual_sealed, actual_stock, abnormal_note, counted_by, counted_by_student_id, counted_at, is_new_registration
  ) values (
    p_session_id, v_reagent_id, v_lot_id, 0, 0, 'active', v_loc,
    1, v_stock, nullif(trim(p_abnormal_note), ''), v_name, v_student_id, now(), true
  );
  return jsonb_build_object('reagent_id', v_reagent_id, 'lot_id', v_lot_id, 'reused_reagent', p_reagent_id is not null);
end;
$$;
revoke all on function public.inventory_new_registration(text, bigint, uuid, jsonb, jsonb, text) from public;
grant execute on function public.inventory_new_registration(text, bigint, uuid, jsonb, jsonb, text) to anon, authenticated;


-- ── 3) 관리자: 세션 시작 ────────────────────────────────────────────────────
create or replace function public.inventory_session_start(
  p_year int, p_start_date date, p_label text, p_purpose text, p_zones text[], p_location_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_id bigint;
  v_n int;
begin
  v_actor := public._admin_actor();
  if p_purpose not in ('full_census', 'current_list') then raise exception '실사 목적이 올바르지 않습니다.'; end if;
  if p_start_date is null then raise exception '날짜를 선택해주세요.'; end if;
  perform pg_advisory_xact_lock(hashtext('inventory_session_start'));
  if exists (select 1 from public.inventory_sessions where status in ('active', 'paused', 'reviewed')) then
    raise exception '이미 진행 중인 실사가 있습니다. 먼저 종료하거나 취소해주세요.' using errcode = '55000';
  end if;
  if p_location_ids is not null and array_length(p_location_ids, 1) is null then
    raise exception '해당 구역에 등록된 위치가 없습니다.';
  end if;

  insert into public.inventory_sessions (year, start_date, status, created_by, label, purpose, zones)
  values (p_year, p_start_date, 'active', v_actor, nullif(trim(p_label), ''), p_purpose,
          case when p_zones is null or array_length(p_zones, 1) is null then null else p_zones end)
  returning id into v_id;

  insert into public.inventory_counts (session_id, reagent_id, lot_id, book_sealed, book_stock, book_status, book_location_id,
                                       book_reagent_fields, book_lot_fields)
  select v_id, l.reagent_id, l.id, l.sealed_count, l.current_stock, l.status, l.location_id,
         jsonb_build_object('name', coalesce(r.name, ''), 'cas_no', coalesce(r.cas_no, ''), 'company', coalesce(r.company, ''),
                            'hazard', coalesce(r.hazard, ''), 'category', coalesce(r.category, ''), 'volume', coalesce(r.volume::text, ''),
                            'unit', coalesce(r.unit, ''), 'purity', coalesce(r.purity, '')),
         jsonb_build_object('cat_no', coalesce(l.cat_no, ''), 'lot_no', coalesce(l.lot_no, ''))
    from public.reagent_lots l join public.reagents r on r.id = l.reagent_id
   where l.status = 'active' and (p_location_ids is null or l.location_id = any (p_location_ids));
  get diagnostics v_n = row_count;

  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '재고실사 시작', 'inventory', '실사 #' || v_id || ' · Lot ' || v_n || '개');
  return jsonb_build_object('session_id', v_id, 'lots', v_n);
end;
$$;
revoke all on function public.inventory_session_start(int, date, text, text, text[], uuid[]) from public, anon;
grant execute on function public.inventory_session_start(int, date, text, text, text[], uuid[]) to authenticated;


-- ── 4) 관리자: 상태 전이(pause / resume / review / reopen / cancel) ───────────────
create or replace function public.inventory_session_transition(p_session_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_s public.inventory_sessions%rowtype;
  v_new text;
  v_del_lots uuid[];
  v_del_reagents uuid[];
begin
  v_actor := public._admin_actor();
  select * into v_s from public.inventory_sessions where id = p_session_id for update;
  if not found then raise exception '존재하지 않는 실사입니다.'; end if;

  if p_action = 'pause' then
    if v_s.status <> 'active' then raise exception '진행 중인 실사만 일시중단할 수 있습니다. (현재: %)', v_s.status using errcode = '55000'; end if;
    update public.inventory_sessions set status = 'paused', paused_at = now(), paused_by = v_actor where id = p_session_id;
    v_new := 'paused';
  elsif p_action = 'resume' then
    if v_s.status <> 'paused' then raise exception '일시중단된 실사만 재개할 수 있습니다. (현재: %)', v_s.status using errcode = '55000'; end if;
    update public.inventory_sessions set status = 'active', paused_at = null, paused_by = null where id = p_session_id;
    v_new := 'active';
  elsif p_action = 'review' then
    -- ③ 실사 완료(검토 단계) — 장부는 건드리지 않는다.
    if v_s.status not in ('active', 'paused') then raise exception '진행 중인 실사만 완료 처리할 수 있습니다. (현재: %)', v_s.status using errcode = '55000'; end if;
    update public.inventory_sessions set status = 'reviewed', paused_at = null, paused_by = null where id = p_session_id;
    v_new := 'reviewed';
  elsif p_action = 'reopen' then
    if v_s.status <> 'reviewed' then raise exception '검토 단계의 실사만 다시 열 수 있습니다. (현재: %)', v_s.status using errcode = '55000'; end if;
    update public.inventory_sessions set status = 'active' where id = p_session_id;
    v_new := 'active';
  elsif p_action = 'cancel' then
    if v_s.status not in ('active', 'paused', 'reviewed') then raise exception '이미 종료된 실사입니다. (현재: %)', v_s.status using errcode = '55000'; end if;
    -- 이 실사에서 새로 등록된(아직 미확정) 시약/Lot 정리 — 장부에 남으면 안 되는 임시 등록분.
    select coalesce(array_agg(c.lot_id), '{}') into v_del_lots
      from public.inventory_counts c join public.reagent_lots l on l.id = c.lot_id
     where c.session_id = p_session_id and c.is_new_registration and l.pending_confirm
       and not exists (select 1 from public.location_history h where h.lot_id = l.id)
       and not exists (select 1 from public.disposal_requests d where d.lot_id = l.id)
       and not exists (select 1 from public.location_requests q where q.lot_id = l.id);
    delete from public.inventory_counts c where c.session_id = p_session_id and c.lot_id = any (v_del_lots);
    select coalesce(array_agg(distinct reagent_id), '{}') into v_del_reagents from public.reagent_lots where id = any (v_del_lots);
    delete from public.reagent_lots where id = any (v_del_lots);
    delete from public.reagents r
     where r.id = any (v_del_reagents) and r.pending_confirm
       and not exists (select 1 from public.reagent_lots l where l.reagent_id = r.id);
    update public.inventory_sessions set status = 'closed' where id = p_session_id;
    v_new := 'closed';
  else
    raise exception '알 수 없는 작업입니다.';
  end if;

  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '재고실사 ' || p_action, 'inventory', '실사 #' || p_session_id || ' → ' || v_new);
  return jsonb_build_object('session_id', p_session_id, 'status', v_new);
end;
$$;
revoke all on function public.inventory_session_transition(bigint, text) from public, anon;
grant execute on function public.inventory_session_transition(bigint, text) to authenticated;


-- ── 5) 관리자: ④ DB 최종 반영 — 단일 트랜잭션 ─────────────────────────────────
create or replace function public.inventory_session_finalize(p_session_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_s public.inventory_sessions%rowtype;
  c public.inventory_counts%rowtype;
  v_label text;
  v_done_reagents uuid[] := '{}';
  v_book jsonb; v_key text; v_val text; v_type text;
  v_after_sealed int; v_after_stock int;
  v_lot public.reagent_lots%rowtype;
  v_from_name text; v_to_name text;
  v_lots int := 0; v_reagents int := 0; v_moves int := 0; v_skipped int := 0;
  v_low uuid[] := '{}';
  v_rkeys text[] := array['name','cas_no','company','hazard','category','volume','unit','purity'];
  v_lkeys text[] := array['cat_no','lot_no'];
begin
  v_actor := public._admin_actor();
  select * into v_s from public.inventory_sessions where id = p_session_id for update;
  if not found then raise exception '존재하지 않는 실사입니다.'; end if;
  if v_s.status <> 'reviewed' then
    raise exception '"실사 완료(검토)" 처리된 실사만 최종 반영할 수 있습니다. (현재: %)', v_s.status using errcode = '55000';
  end if;

  for c in
    select * from public.inventory_counts
     where session_id = p_session_id
       and (actual_sealed is not null or is_new_registration or staged_reagent_fields is not null)
     order by id
  loop
    v_label := '[실사] ' || coalesce(c.counted_by, v_s.created_by);

    -- 시약 기본정보(같은 시약의 Lot이 여럿이어도 1회)
    if c.staged_reagent_fields is not null and not (c.reagent_id = any (v_done_reagents)) then
      v_done_reagents := v_done_reagents || c.reagent_id;
      v_book := coalesce(c.book_reagent_fields, '{}'::jsonb);
      for v_key, v_val in select k, v from jsonb_each_text(c.staged_reagent_fields) as t(k, v) loop
        continue when not (v_key = any (v_rkeys));
        continue when v_val is not distinct from coalesce(v_book->>v_key, '');
        select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
         where a.attrelid = 'public.reagents'::regclass and a.attname = v_key and not a.attisdropped;
        execute format('update public.reagents set %I = $1::%s, pending_confirm = false where id = $2', v_key, v_type)
          using case when v_type = 'text' or v_type like 'character%' then v_val else nullif(v_val, '') end, c.reagent_id;
        insert into public.reagent_change_requests (reagent_id, field_name, old_value, new_value, requested_by, status, approved_by, approved_at)
          values (c.reagent_id, v_key, coalesce(v_book->>v_key, ''), v_val, v_label, 'approved', v_actor, now());
        v_reagents := v_reagents + 1;
      end loop;
    end if;

    if not c.is_new_registration then
      select * into v_lot from public.reagent_lots where id = c.lot_id for update;
      if not found then v_skipped := v_skipped + 1; continue; end if;
      v_after_sealed := coalesce(c.actual_sealed, c.book_sealed);
      v_after_stock := coalesce(c.actual_stock, c.book_stock);
      update public.reagent_lots set
        sealed_count = v_after_sealed, current_stock = v_after_stock, needs_review = false, pending_confirm = false,
        status = case when c.reported_missing then 'missing' else status end,
        location_id = coalesce(c.staged_location_id, location_id)
       where id = c.lot_id;
      if c.staged_lot_fields is not null then
        v_book := coalesce(c.book_lot_fields, '{}'::jsonb);
        for v_key, v_val in select k, v from jsonb_each_text(c.staged_lot_fields) as t(k, v) loop
          continue when not (v_key = any (v_lkeys));
          continue when v_val is not distinct from coalesce(v_book->>v_key, '');
          execute format('update public.reagent_lots set %I = $1 where id = $2', v_key) using v_val, c.lot_id;
        end loop;
      end if;
      insert into public.stock_logs (target_type, lot_id, user_name, before_sealed, after_sealed, before_stock, after_stock)
        values ('reagent', c.lot_id, v_label, c.book_sealed, v_after_sealed, c.book_stock, v_after_stock);
      if c.staged_location_id is not null and c.staged_location_id is distinct from c.book_location_id then
        v_from_name := case when c.book_location_id is null then '미지정' else public._location_label(c.book_location_id, ' - ') end;
        v_to_name := public._location_label(c.staged_location_id, ' - ');
        insert into public.location_history (reagent_id, lot_id, from_location_id, from_location_name, to_location_id, to_location_name, moved_by)
          values (c.reagent_id, c.lot_id, c.book_location_id, v_from_name, c.staged_location_id, v_to_name, v_label);
        v_moves := v_moves + 1;
      end if;
      if v_after_sealed = 0 and v_after_stock <= 20 then v_low := v_low || c.lot_id; end if;
      v_lots := v_lots + 1;
    else
      -- 신규 등록 Lot: 값은 등록 시점에 들어가 있음 — 확정(미확정 표시 해제) + 최초 재고 이력
      update public.reagent_lots set pending_confirm = false where id = c.lot_id;
      update public.reagents set pending_confirm = false where id = c.reagent_id;
      insert into public.stock_logs (target_type, lot_id, user_name, before_sealed, after_sealed, before_stock, after_stock)
        values ('reagent', c.lot_id, v_label, 0, coalesce(c.actual_sealed, 1), 0, coalesce(c.actual_stock, 0));
      v_lots := v_lots + 1;
    end if;
  end loop;

  -- 이번 실사에서 확인된 시약의 검토대기 표시 해제(예전 최종 반영과 동일)
  update public.reagents set pending_confirm = false
   where pending_confirm and id in (select reagent_id from public.inventory_counts
                                     where session_id = p_session_id and (actual_sealed is not null or is_new_registration or staged_reagent_fields is not null));

  update public.inventory_sessions set status = 'completed', completed_at = now() where id = p_session_id;
  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '재고실사 최종 반영', 'inventory',
            '실사 #' || p_session_id || ' · Lot ' || v_lots || '개, 시약정보 ' || v_reagents || '건, 위치이동 ' || v_moves || '건');
  return jsonb_build_object('session_id', p_session_id, 'status', 'completed', 'lots', v_lots, 'reagent_fields', v_reagents,
                            'moves', v_moves, 'skipped', v_skipped, 'low_stock_lot_ids', to_jsonb(v_low));
end;
$$;
revoke all on function public.inventory_session_finalize(bigint) from public, anon;
grant execute on function public.inventory_session_finalize(bigint) to authenticated;
