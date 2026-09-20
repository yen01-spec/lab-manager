-- ════════════════════════════════════════════════════════════════════════
-- Master Finish Phase 4/10 — 시약·Lot 도메인의 학생 쓰기를 세션 토큰 RPC로, 관리자 재고 조정을
-- Auth 관리자 RPC로 옮기고, stock_logs / location_history 를 "서버 생성 전용 감사기록" 으로 만든다.
-- 내부관리번호(KNU-YYYYMMDD-NNN) 생성도 서버 원자 카운터로 중앙화한다.
--
-- ⚠️ staging에만 적용. production 미적용.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) 내부관리번호 중앙 생성기 ─────────────────────────────────────────────
-- 카운터 테이블(day별 마지막 순번). 클라이언트가 "max+1"을 계산하던 방식은 동시 실행 시 같은 번호를
-- 줄 수 있었다. 카운터를 upsert 로 원자적으로 증가시키면 서로 다른 트랜잭션/기기에서도 번호가 겹치지 않는다
-- (INSERT 실패 시 번호가 비는 gap 은 허용). 이미 존재하는 KNU 번호(예: 재고 동기화 RPC 가 만든 것)보다
-- 항상 크게 시작하도록 매번 max(existing) 과 비교한다. 날짜는 한국시간 기준(기존 클라이언트 동작과 동일).
create table if not exists public.internal_lot_counters (
  day text primary key,
  last_seq int not null
);
alter table public.internal_lot_counters enable row level security;
revoke all on public.internal_lot_counters from anon, authenticated;

-- 최후 방어선: 자동 생성 형식의 lot_no 는 전역 유일. (production 확인: 현재 KNU 형식 Lot 0건, 중복 0건)
create unique index if not exists reagent_lots_generated_lot_no_key
  on public.reagent_lots (lot_no) where lot_no ~ '^KNU-[0-9]{8}-[0-9]+$';

create or replace function public._next_internal_lot_nos(p_count int)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day text := to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD');
  v_prefix text;
  v_max int;
  v_last int;
begin
  if p_count is null or p_count < 1 or p_count > 500 then raise exception '요청 개수가 올바르지 않습니다.'; end if;
  v_prefix := 'KNU-' || v_day || '-';
  perform pg_advisory_xact_lock(hashtext('knu_internal_lot_no'));
  select coalesce(max(substring(lot_no from '^KNU-[0-9]{8}-([0-9]+)$')::int), 0) into v_max
    from public.reagent_lots where lot_no ~ ('^' || v_prefix || '[0-9]+$');
  insert into public.internal_lot_counters (day, last_seq) values (v_day, v_max + p_count)
  on conflict (day) do update set last_seq = greatest(internal_lot_counters.last_seq, v_max) + p_count
  returning last_seq into v_last;
  return array(select v_prefix || lpad(n::text, 3, '0') from generate_series(v_last - p_count + 1, v_last) n);
end;
$$;
revoke all on function public._next_internal_lot_nos(int) from public, anon, authenticated;

-- 관리자 화면(Excel 일괄 추가/시약 1건 추가)이 삽입 전에 번호를 확보할 때
create or replace function public.admin_next_internal_lot_nos(p_count int)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._admin_actor();
  return public._next_internal_lot_nos(p_count);
end;
$$;
revoke all on function public.admin_next_internal_lot_nos(int) from public, anon;
grant execute on function public.admin_next_internal_lot_nos(int) to authenticated;


-- 폼 값 → (lot_no, lot_source): 제조사 Lot 우선, 없다고 표시하면 내부번호 자동 부여(서버 확정)
create or replace function public._resolve_lot_no(p_lot jsonb, out o_lot_no text, out o_lot_source text)
language plpgsql
security definer
set search_path = public
as $$
declare v_reason text := nullif(p_lot->>'no_lot_reason', '');
begin
  if v_reason is not null then
    if v_reason not in ('unmarked', 'unknown') then raise exception '알 수 없는 사유입니다.'; end if;
    o_lot_no := (public._next_internal_lot_nos(1))[1];
    o_lot_source := 'generated:' || v_reason;
  elsif nullif(trim(p_lot->>'lot_no'), '') is not null then
    o_lot_no := trim(p_lot->>'lot_no');
    o_lot_source := 'manufacturer';
  else
    o_lot_no := null;
    o_lot_source := 'unspecified';
  end if;
end;
$$;
revoke all on function public._resolve_lot_no(jsonb) from public, anon, authenticated;


-- ── 2) 학생: 신규/직접제조 시약 등록(ReagentList "신규 시약 등록") — 미확정(pending_confirm) 등록 ──
create or replace function public.reagent_register(
  p_session_token text, p_kind text, p_reagent_id uuid, p_reagent jsonb, p_lot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_reagent_id uuid := p_reagent_id;
  v_lot_id uuid;
  v_loc uuid;
  v_no text; v_src text;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  if p_kind not in ('purchased', 'self_made') then raise exception '등록 종류가 올바르지 않습니다.'; end if;
  v_loc := nullif(p_lot->>'location_id', '')::uuid;
  if v_loc is null or not exists (select 1 from public.locations where id = v_loc) then raise exception '보관 위치를 선택해주세요.'; end if;

  if p_kind = 'self_made' then
    if p_reagent is null or nullif(trim(p_reagent->>'name'), '') is null then raise exception '시약명을 입력해주세요.'; end if;
    insert into public.reagents (name, volume, unit, location_id, reagent_type, made_date, made_purpose, registered_by, pending_confirm, sort_letter)
    values (trim(p_reagent->>'name'), nullif(p_reagent->>'volume', '')::numeric, nullif(p_reagent->>'unit', ''), v_loc, 'self_made',
            nullif(p_reagent->>'made_date', '')::date, nullif(p_reagent->>'made_purpose', ''), v_student_id, true, nullif(p_reagent->>'sort_letter', ''))
    returning id into v_reagent_id;
    insert into public.reagent_lots (reagent_id, sealed_count, current_stock, received_date, pending_confirm)
    values (v_reagent_id, 0, 100, nullif(p_reagent->>'made_date', '')::date, true) returning id into v_lot_id;
    return jsonb_build_object('reagent_id', v_reagent_id, 'lot_id', v_lot_id, 'lot_no', null);
  end if;

  if v_reagent_id is null then
    if p_reagent is null or nullif(trim(p_reagent->>'name'), '') is null then raise exception '시약명을 입력해주세요.'; end if;
    insert into public.reagents (name, cas_no, company, category, volume, unit, registered_by, pending_confirm, sort_letter)
    values (trim(p_reagent->>'name'), nullif(p_reagent->>'cas_no', ''), nullif(p_reagent->>'company', ''), nullif(p_reagent->>'category', ''),
            nullif(p_reagent->>'volume', '')::numeric, nullif(p_reagent->>'unit', ''), v_student_id, true, nullif(p_reagent->>'sort_letter', ''))
    returning id into v_reagent_id;
  elsif not exists (select 1 from public.reagents where id = v_reagent_id and status <> 'archived') then
    raise exception '존재하지 않는 시약입니다.';
  end if;

  select o_lot_no, o_lot_source into v_no, v_src from public._resolve_lot_no(p_lot);
  insert into public.reagent_lots (reagent_id, location_id, lot_no, lot_source, cat_no, sealed_count, current_stock, received_date, pending_confirm)
  values (v_reagent_id, v_loc, v_no, v_src, nullif(p_lot->>'cat_no', ''),
          coalesce(nullif(p_lot->>'sealed_count', '')::int, 0), coalesce(nullif(p_lot->>'current_stock', '')::int, 0),
          (now() at time zone 'Asia/Seoul')::date, true)
  returning id into v_lot_id;
  return jsonb_build_object('reagent_id', v_reagent_id, 'lot_id', v_lot_id, 'lot_no', v_no, 'lot_source', v_src);
end;
$$;
revoke all on function public.reagent_register(text, text, uuid, jsonb, jsonb) from public;
grant execute on function public.reagent_register(text, text, uuid, jsonb, jsonb) to anon, authenticated;


-- ── 3) 학생/관리자 공용 화면: 기존 시약에 새 Lot 추가(재구매) + 최초 재고 이력 ──
create or replace function public.lot_add(p_session_token text, p_reagent_id uuid, p_lot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_name text;
  v_loc uuid;
  v_lot_id uuid;
  v_no text; v_src text;
  v_sealed int; v_stock int;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  select name into v_name from public.students where student_id = v_student_id;
  if not exists (select 1 from public.reagents where id = p_reagent_id and status <> 'archived') then raise exception '존재하지 않는 시약입니다.'; end if;
  v_loc := nullif(p_lot->>'location_id', '')::uuid;
  if v_loc is null or not exists (select 1 from public.locations where id = v_loc) then raise exception '보관 위치를 선택해주세요.'; end if;
  v_sealed := coalesce(nullif(p_lot->>'sealed_count', '')::int, 0);
  v_stock := coalesce(nullif(p_lot->>'current_stock', '')::int, 0);
  if v_sealed < 0 or v_stock < 0 or v_stock > 100 then raise exception '수량 값이 올바르지 않습니다.'; end if;

  select o_lot_no, o_lot_source into v_no, v_src from public._resolve_lot_no(p_lot);
  insert into public.reagent_lots (reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock, location_id, received_date, expiry_date, status)
  values (p_reagent_id, v_no, v_src, nullif(p_lot->>'cat_no', ''), v_sealed, v_stock, v_loc,
          nullif(p_lot->>'received_date', '')::date, nullif(p_lot->>'expiry_date', '')::date, 'active')
  returning id into v_lot_id;
  insert into public.stock_logs (target_type, lot_id, user_name, before_sealed, after_sealed, before_stock, after_stock)
    values ('reagent', v_lot_id, v_name, 0, v_sealed, 0, v_stock);
  return jsonb_build_object('lot_id', v_lot_id, 'lot_no', v_no, 'lot_source', v_src);
end;
$$;
revoke all on function public.lot_add(text, uuid, jsonb) from public;
grant execute on function public.lot_add(text, uuid, jsonb) to anon, authenticated;


-- ── 4) 학생: "정보 맞음 · 확인만 하기" ─────────────────────────────────────
create or replace function public.reagent_confirm(p_session_token text, p_reagent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text;
  v_now timestamptz := now();
  v_rows int;
begin
  v_student_id := public._resolve_student_session(p_session_token);
  update public.reagents set last_confirmed_at = v_now, confirmed_by = v_student_id where id = p_reagent_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception '존재하지 않는 시약입니다.'; end if;
  return jsonb_build_object('last_confirmed_at', v_now, 'confirmed_by', v_student_id);
end;
$$;
revoke all on function public.reagent_confirm(text, uuid) from public;
grant execute on function public.reagent_confirm(text, uuid) to anon, authenticated;


-- ── 5) 공개 API 기반 자동 보강(CAS/GHS/유해분류) — "비어 있는 칸만" 채운다(덮어쓰기 불가) ──
-- 시약 상세를 여는 누구나 트리거하던 동작을 보존하되, 비어있는 컬럼에 화이트리스트 값만 넣을 수 있게 제한.
create or replace function public.reagent_enrich(p_reagent_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_allowed text[] := array['cas_no', 'cas_source', 'hazard', 'hazard_source', 'ghs_pictograms', 'hazard_classifications', 'is_yudok'];
  v_type text;
  v_cur text;
  v_applied text[] := '{}';
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception '형식이 올바르지 않습니다.'; end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    if not (v_key = any (v_allowed)) then raise exception '보강할 수 없는 항목입니다: %', v_key; end if;
  end loop;
  if not exists (select 1 from public.reagents where id = p_reagent_id) then raise exception '존재하지 않는 시약입니다.'; end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    -- *_source 는 짝이 되는 값이 채워질 때만 함께 기록(단독 변경 불가)
    continue when v_key in ('cas_source', 'hazard_source');
    select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
     where a.attrelid = 'public.reagents'::regclass and a.attname = v_key and not a.attisdropped;
    continue when v_type is null;
    execute format('select nullif(%I::text, '''') from public.reagents where id = $1', v_key) into v_cur using p_reagent_id;
    if v_cur is null and p_fields->v_key is not null and p_fields->>v_key <> '' and p_fields->>v_key <> 'null' then
      if v_type = 'jsonb' then
        execute format('update public.reagents set %I = $1::jsonb where id = $2', v_key) using (p_fields->v_key)::text, p_reagent_id;
      else
        execute format('update public.reagents set %I = $1::%s where id = $2', v_key, v_type) using p_fields->>v_key, p_reagent_id;
      end if;
      v_applied := v_applied || v_key;
      if v_key = 'cas_no' and p_fields ? 'cas_source' then update public.reagents set cas_source = p_fields->>'cas_source' where id = p_reagent_id; end if;
      if v_key = 'hazard' and p_fields ? 'hazard_source' then update public.reagents set hazard_source = p_fields->>'hazard_source' where id = p_reagent_id; end if;
    end if;
  end loop;
  return jsonb_build_object('applied', to_jsonb(v_applied));
end;
$$;
revoke all on function public.reagent_enrich(uuid, jsonb) from public;
grant execute on function public.reagent_enrich(uuid, jsonb) to anon, authenticated;


-- ── 6) 관리자: 재고 조정 / 상태 변경 / 위치 이동 — 감사기록(stock_logs/location_history)은 서버 생성 ──
create or replace function public.admin_lot_update(p_lot_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_lot public.reagent_lots%rowtype;
  v_key text;
  v_sealed int; v_stock int;
begin
  v_actor := public._admin_actor();
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception '형식이 올바르지 않습니다.'; end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key not in ('sealed_count', 'current_stock') then raise exception '수정할 수 없는 항목입니다: %', v_key; end if;
  end loop;
  select * into v_lot from public.reagent_lots where id = p_lot_id for update;
  if not found then raise exception '존재하지 않는 Lot입니다.'; end if;
  v_sealed := coalesce((p_fields->>'sealed_count')::int, v_lot.sealed_count);
  v_stock := coalesce((p_fields->>'current_stock')::int, v_lot.current_stock);
  if v_sealed < 0 or v_stock < 0 or v_stock > 100 then raise exception '수량 값이 올바르지 않습니다.'; end if;
  update public.reagent_lots set sealed_count = v_sealed, current_stock = v_stock, needs_review = false where id = p_lot_id;
  insert into public.stock_logs (target_type, lot_id, user_name, before_sealed, after_sealed, before_stock, after_stock)
    values ('reagent', p_lot_id, v_actor, v_lot.sealed_count, v_sealed, v_lot.current_stock, v_stock);
  return jsonb_build_object('lot_id', p_lot_id, 'sealed_count', v_sealed, 'current_stock', v_stock);
end;
$$;
revoke all on function public.admin_lot_update(uuid, jsonb) from public, anon;
grant execute on function public.admin_lot_update(uuid, jsonb) to authenticated;

create or replace function public.admin_lot_set_status(p_lot_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_lot public.reagent_lots%rowtype;
begin
  v_actor := public._admin_actor();
  if p_status not in ('used_up', 'missing') then raise exception '변경할 수 없는 상태입니다.'; end if;
  select * into v_lot from public.reagent_lots where id = p_lot_id for update;
  if not found then raise exception '존재하지 않는 Lot입니다.'; end if;
  update public.reagent_lots set status = p_status, sealed_count = 0, current_stock = 0, needs_review = false where id = p_lot_id;
  insert into public.stock_logs (target_type, lot_id, user_name, before_sealed, after_sealed, before_stock, after_stock)
    values ('reagent', p_lot_id, v_actor, v_lot.sealed_count, 0, v_lot.current_stock, 0);
  return jsonb_build_object('lot_id', p_lot_id, 'status', p_status);
end;
$$;
revoke all on function public.admin_lot_set_status(uuid, text) from public, anon;
grant execute on function public.admin_lot_set_status(uuid, text) to authenticated;

create or replace function public.admin_lot_move(p_lot_id uuid, p_to_location_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_lot public.reagent_lots%rowtype;
  v_name text;
begin
  v_actor := public._admin_actor();
  select * into v_lot from public.reagent_lots where id = p_lot_id for update;
  if not found then raise exception '존재하지 않는 Lot입니다.'; end if;
  if not exists (select 1 from public.locations where id = p_to_location_id) then raise exception '이동할 위치가 존재하지 않습니다.'; end if;
  if v_lot.location_id is not distinct from p_to_location_id then raise exception '현재 위치와 같습니다.'; end if;
  select name into v_name from public.reagents where id = v_lot.reagent_id;
  update public.reagent_lots set location_id = p_to_location_id where id = p_lot_id;
  insert into public.location_history (reagent_id, lot_id, reagent_name, from_location_id, from_location_name, to_location_id, to_location_name, moved_by, notes)
    values (v_lot.reagent_id, p_lot_id, v_name, v_lot.location_id, public._location_label(v_lot.location_id, ' - '),
            p_to_location_id, public._location_label(p_to_location_id, ' - '), v_actor, nullif(p_notes, ''));
  return jsonb_build_object('lot_id', p_lot_id, 'to', public._location_label(p_to_location_id, ' - '));
end;
$$;
revoke all on function public.admin_lot_move(uuid, uuid, text) from public, anon;
grant execute on function public.admin_lot_move(uuid, uuid, text) to authenticated;
