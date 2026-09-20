-- ════════════════════════════════════════════════════════════════════════
-- 전체 백업 / 전체 복원(빈 대상) — 시약/재고/위치/관리이력 범위.
--
-- ⚠️ staging 에서만 설계·검증. production 미적용(적용 대기 목록의 11번째). production restore 는 계속 비활성:
--    admin_restore_full 의 "실행"은 app_settings.restore_enabled = 'true' 가 수동으로 설정된 환경에서만 통과한다
--    (이 migration 은 그 값을 만들지 않는다). dry-run(검증)은 쓰기 0.
--
-- 범위(FK 부모 → 자식 순서 = _backup_tables()):
--   students, locations, reagents, reagent_lots, location_history, location_requests, disposal_requests,
--   reagent_change_requests, stock_history, stock_logs, reagent_import_history, special_material_logs,
--   inventory_sessions, inventory_assignments, inventory_counts, admin_logs
-- 제외: Auth 사용자(auth.*)와 admin_users(auth.users uuid 를 참조 → 복원 후 이메일로 재등록), fcm_tokens, student_sessions,
--       app_settings(관리자 비밀번호 행 포함)/설정성 시드 테이블, school_chemical_master(재임포트 가능), Storage 파일.
-- 안전장치: 전체 복원은 대상 테이블이 전부 비어 있을 때만. 기존 데이터를 덮어쓰지 않는다(병합 복원 없음).
-- 검증: 행 수 + 서버가 계산한 테이블 digest(md5) 를 백업 시점 값과 비교 — 불일치 시 전체 롤백.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public._backup_tables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests',
               'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history',
               'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs']::text[];
$$;
revoke all on function public._backup_tables() from public, anon, authenticated;

-- 범위 테이블의 (이름:컬럼:타입) 목록 해시 — 백업과 복원 대상의 스키마가 같은지 확인하는 schema_version.
create or replace function public._backup_schema_version()
returns text
language sql
stable
set search_path = public
as $$
  select 'v1-' || substr(md5(string_agg(t || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by t, a.attnum)), 1, 12)
    from unnest(public._backup_tables()) t
    join pg_attribute a on a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped;
$$;
revoke all on function public._backup_schema_version() from public, anon, authenticated;

create or replace function public._backup_columns(p_table text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb)
    from pg_attribute a where a.attrelid = format('public.%I', p_table)::regclass and a.attnum > 0 and not a.attisdropped;
$$;
revoke all on function public._backup_columns(text) from public, anon, authenticated;

create or replace function public._rows_digest(p_rows jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(coalesce(string_agg(e::text, '|' order by e::text), '')) from jsonb_array_elements(p_rows) e;
$$;
revoke all on function public._rows_digest(jsonb) from public, anon, authenticated;

create or replace function public._table_digest(p_table text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare v_rows jsonb;
begin
  if not (p_table = any (public._backup_tables())) then raise exception '백업 범위 밖 테이블입니다: %', p_table; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', p_table) into v_rows;
  return public._rows_digest(v_rows);
end;
$$;
revoke all on function public._table_digest(text) from public, anon, authenticated;

-- ── 복원 활성 여부(상태 조회) ─────────────────────────────────────────────────
create or replace function public.admin_restore_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_enabled boolean := false;
begin
  perform public._admin_actor();
  begin
    select coalesce(value, '') = 'true' into v_enabled from public.app_settings where key = 'restore_enabled';
  exception when undefined_table then v_enabled := false;
  end;
  return jsonb_build_object('enabled', coalesce(v_enabled, false), 'schema_version', public._backup_schema_version(), 'tables', to_jsonb(public._backup_tables()));
end;
$$;
revoke all on function public.admin_restore_status() from public, anon;
grant execute on function public.admin_restore_status() to authenticated;

-- ── 백업 스냅샷 ───────────────────────────────────────────────────────────────
create or replace function public.admin_backup_export()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_digests jsonb := '{}'::jsonb;
  v_cols jsonb := '{}'::jsonb;
  t text;
  v_rows jsonb;
begin
  perform public._admin_actor();
  foreach t in array public._backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v_rows;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
    v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
    v_digests := v_digests || jsonb_build_object(t, public._rows_digest(v_rows));
    v_cols := v_cols || jsonb_build_object(t, public._backup_columns(t));
  end loop;
  return jsonb_build_object(
    'backup_version', 1, 'created_at', now(), 'schema_version', public._backup_schema_version(),
    'table_order', to_jsonb(public._backup_tables()), 'table_counts', v_counts, 'table_digests', v_digests,
    'table_columns', v_cols, 'tables', v_tables);
end;
$$;
revoke all on function public.admin_backup_export() from public, anon;
grant execute on function public.admin_backup_export() to authenticated;

-- ── 전체 복원(빈 대상) ────────────────────────────────────────────────────────
-- p_dry_run = true(기본): 검증 + 실제 삽입을 시도한 뒤 "항상 롤백"(쓰기 0). false: 커밋 — restore_enabled 와 p_confirm='RESTORE' 필요.
create or replace function public.admin_restore_full(p_payload jsonb, p_dry_run boolean default true, p_confirm text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_tables text[] := public._backup_tables();
  v_issues jsonb := '[]'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
  v_digests jsonb := '{}'::jsonb;
  v_error text := null;
  v_enabled boolean := false;
  t text; k text;
  v_rows jsonb;
  v_n bigint;
  rec record;
  v_sql text;
  v_pk text;
  v_cols text; v_pcols text; v_nn text; v_eq text;
begin
  v_actor := public._admin_actor();
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception '백업 데이터 형식이 올바르지 않습니다.'; end if;
  if not p_dry_run then
    begin
      select coalesce(value, '') = 'true' into v_enabled from public.app_settings where key = 'restore_enabled';
    exception when undefined_table then v_enabled := false;
    end;
    if not coalesce(v_enabled, false) then raise exception '이 환경에서는 복원 실행이 비활성화되어 있습니다.' using errcode = '42501'; end if;
    if p_confirm is distinct from 'RESTORE' then raise exception '확인 문구(RESTORE)가 필요합니다.'; end if;
  end if;

  -- 1) manifest / 스키마
  if (p_payload->>'backup_version') is distinct from '1' then
    v_issues := v_issues || jsonb_build_object('code', 'backup_version', 'message', 'backup_version 이 지원되지 않습니다: ' || coalesce(p_payload->>'backup_version', '없음'));
  end if;
  if (p_payload->>'schema_version') is distinct from public._backup_schema_version() then
    v_issues := v_issues || jsonb_build_object('code', 'schema_version', 'message', 'schema_version 불일치 — 백업: ' || coalesce(p_payload->>'schema_version', '없음') || ' / 현재 DB: ' || public._backup_schema_version());
  end if;
  if jsonb_typeof(p_payload->'tables') is distinct from 'object' then
    v_issues := v_issues || jsonb_build_object('code', 'tables', 'message', 'tables 항목이 없습니다.');
  else
    for k in select jsonb_object_keys(p_payload->'tables') loop
      if not (k = any (v_tables)) then v_issues := v_issues || jsonb_build_object('code', 'unknown_table', 'table', k, 'message', '복원 범위 밖 테이블이 들어 있습니다.'); end if;
    end loop;
  end if;

  if jsonb_array_length(v_issues) = 0 then
    -- 2) 테이블별: 행 수 / 컬럼 / 빈 대상 / PK 중복
    foreach t in array v_tables loop
      v_rows := p_payload->'tables'->t;
      if jsonb_typeof(v_rows) is distinct from 'array' then
        v_issues := v_issues || jsonb_build_object('code', 'missing_table', 'table', t, 'message', '테이블 데이터가 없습니다.'); continue;
      end if;
      if jsonb_array_length(v_rows) <> coalesce((p_payload->'table_counts'->>t)::bigint, -1) then
        v_issues := v_issues || jsonb_build_object('code', 'count_mismatch', 'table', t, 'message', format('행 수가 manifest 와 다릅니다 (파일 %s / manifest %s).', jsonb_array_length(v_rows), p_payload->'table_counts'->>t));
      end if;
      if (p_payload->'table_columns'->t) is distinct from public._backup_columns(t) then
        v_issues := v_issues || jsonb_build_object('code', 'columns', 'table', t, 'message', '컬럼 구성이 현재 DB 와 다릅니다.');
      end if;
      execute format('select count(*) from public.%I', t) into v_n;
      if v_n > 0 then
        v_issues := v_issues || jsonb_build_object('code', 'target_not_empty', 'table', t, 'count', v_n, 'message', '대상 테이블이 비어 있지 않습니다(전체 복원은 빈 대상에만 가능).');
      end if;
      select string_agg(format('%I', a.attname), ', ' order by k.ord) into v_pk
        from pg_index i
        join lateral unnest(i.indkey::int2[]) with ordinality k(attnum, ord) on true
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
       where i.indrelid = format('public.%I', t)::regclass and i.indisprimary;
      if v_pk is not null then
        execute format('select count(*) from (select 1 from jsonb_populate_recordset(null::public.%I, $1) group by %s having count(*) > 1) d', t, v_pk) into v_n using v_rows;
        if v_n > 0 then v_issues := v_issues || jsonb_build_object('code', 'duplicate_pk', 'table', t, 'count', v_n, 'message', '기본키(PK) 중복이 있습니다.'); end if;
      end if;
    end loop;
  end if;

  -- 3) FK 무결성(범위 안 테이블 사이) — 존재하지 않는 부모 참조
  if jsonb_array_length(v_issues) = 0 then
    for rec in
      select c.oid, cc.relname as child, pc.relname as parent
        from pg_constraint c
        join pg_class cc on cc.oid = c.conrelid
        join pg_class pc on pc.oid = c.confrelid
        join pg_namespace n on n.oid = cc.relnamespace and n.nspname = 'public'
       where c.contype = 'f' and cc.relname = any (v_tables)
    loop
      if not (rec.parent = any (v_tables)) then
        v_issues := v_issues || jsonb_build_object('code', 'fk_outside_scope', 'table', rec.child, 'message', '범위 밖 테이블(' || rec.parent || ')을 참조하는 FK 가 있어 복원할 수 없습니다.'); continue;
      end if;
      select string_agg(format('c.%I', a.attname), ', ' order by k.ord), string_agg(format('c.%I is not null', a.attname), ' and ' order by k.ord)
        into v_cols, v_nn
        from pg_constraint c2 join lateral unnest(c2.conkey) with ordinality k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c2.conrelid and a.attnum = k.attnum where c2.oid = rec.oid;
      select string_agg(format('p.%I', a.attname), ', ' order by k.ord) into v_pcols
        from pg_constraint c2 join lateral unnest(c2.confkey) with ordinality k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c2.confrelid and a.attnum = k.attnum where c2.oid = rec.oid;
      -- 부모 쪽을 MATERIALIZED CTE 로 한 번만 만들고 anti-join(hash) 으로 검사한다(상관 서브쿼리는 행마다 jsonb 를 다시 풀어 O(n*m) 이 된다).
      v_sql := format('with c as materialized (select %s from jsonb_populate_recordset(null::public.%I, $1) c where %s), p as materialized (select %s from jsonb_populate_recordset(null::public.%I, $2) p) select count(*) from c where not exists (select 1 from p where (%s) = (%s))',
                      v_cols, rec.child, v_nn, v_pcols, rec.parent, v_pcols, v_cols);
      execute v_sql into v_n using p_payload->'tables'->rec.child, p_payload->'tables'->rec.parent;
      if v_n > 0 then
        v_issues := v_issues || jsonb_build_object('code', 'fk_orphan', 'table', rec.child, 'count', v_n, 'message', format('존재하지 않는 %s 를 참조하는 행이 %s건 있습니다.', rec.parent, v_n));
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_issues) > 0 then
    return jsonb_build_object('ok', false, 'dry_run', p_dry_run, 'committed', false, 'issues', v_issues);
  end if;

  -- 4) 삽입(부모 → 자식) + digest 검증. dry-run 은 마지막에 의도적으로 예외를 던져 서브트랜잭션째 롤백한다.
  begin
    foreach t in array v_tables loop
      execute format('insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I, $1)', t, t) using p_payload->'tables'->t;
      get diagnostics v_n = row_count;
      v_inserted := v_inserted || jsonb_build_object(t, v_n);
      v_digests := v_digests || jsonb_build_object(t, public._table_digest(t));
      if v_n <> (p_payload->'table_counts'->>t)::bigint then raise exception '삽입 행 수 불일치(%): % / %', t, v_n, p_payload->'table_counts'->>t; end if;
      if (v_digests->>t) is distinct from (p_payload->'table_digests'->>t) then raise exception 'digest 불일치(%): 복원본이 백업 원본과 다릅니다.', t; end if;
    end loop;
    -- identity / serial 시퀀스를 복원된 최대값으로 맞춘다
    for rec in
      select c.relname as tbl, a.attname as col, pg_get_serial_sequence(format('public.%I', c.relname), a.attname) as seq
        from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where c.relname = any (v_tables)
    loop
      if rec.seq is not null then
        execute format('select setval(%L, greatest(coalesce((select max(%I) from public.%I), 1), 1), exists (select 1 from public.%I))', rec.seq, rec.col, rec.tbl, rec.tbl);
      end if;
    end loop;
    if p_dry_run then raise exception '__DRY_RUN_ROLLBACK__'; end if;
  exception when others then
    if sqlerrm = '__DRY_RUN_ROLLBACK__' then
      v_error := null;
    elsif p_dry_run then
      v_error := sqlerrm;
    else
      raise;
    end if;
  end;

  if p_dry_run then
    return jsonb_build_object('ok', v_error is null, 'dry_run', true, 'committed', false, 'error', v_error,
                              'would_insert', v_inserted, 'digests_match', v_error is null);
  end if;

  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '전체 복원 실행', 'backup', '테이블 ' || array_length(v_tables, 1) || '개 복원(digest 검증 통과)');
  return jsonb_build_object('ok', true, 'dry_run', false, 'committed', true, 'inserted', v_inserted, 'digests_match', true);
end;
$$;
revoke all on function public.admin_restore_full(jsonb, boolean, text) from public, anon;
grant execute on function public.admin_restore_full(jsonb, boolean, text) to authenticated;
