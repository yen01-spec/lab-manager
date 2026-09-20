-- ════════════════════════════════════════════════════════════════════════
-- 백업 / 복원 v2 — 두 가지 모드, 둘 다 "빈 대상" 전체 복원만(병합/덮어쓰기 없음).
--
-- ⚠️ staging 에서만 설계·검증. production 미적용(적용 대기 목록의 11번째). production restore 는 계속 비활성:
--    admin_restore_full 의 "실행"은 app_settings.restore_enabled = 'true' 가 수동으로 설정된 환경에서만 통과한다
--    (이 migration 은 그 값을 만들지 않는다). dry-run(검증)은 쓰기 0.
--
-- 모드 A  core = 핵심 시약·재고 백업(FK 부모 → 자식 순서):
--   students, locations, reagents, reagent_lots, location_history, location_requests, disposal_requests,
--   reagent_change_requests, stock_history, stock_logs, reagent_import_history, special_material_logs,
--   inventory_sessions, inventory_assignments, inventory_counts, admin_logs
-- 모드 B  full = 전체 시스템 백업 = core + 구매요청(신 시스템 3표 + 관리자 화면에 보이는 legacy purchase_requests)
--   + notices / notice_files + resource_files + app_settings(allowlist 키만) — Storage 실제 파일은 클라이언트(ZIP)가 함께 담는다.
--
-- 제외(어느 모드에서도): Auth 사용자(auth.*), admin_users(auth.users uuid 종속 — 복원 후 새 Auth 관리자 계정을 만들고 재등록),
--   fcm_tokens, student_sessions, school_chemical_master(재임포트 가능한 참조 데이터 — 필요하면 추후 "참조 데이터 포함" 옵션),
--   app_settings 의 비허용 키(admin_password/super_password 등 비밀번호·토큰·API 비밀 성격은 절대 포함/복원하지 않음).
--
-- app_settings 규칙(전체 dump 금지): allowlist 키만 백업·복원. 복원 시 대상에 같은 키가 있으면
--   같은 값 = 그대로 둠 / 비어 있는('' 또는 NULL) 기본값 = 채움 / 다른 값 = 충돌(dry-run 실패, 덮어쓰지 않음).
--
-- Storage 는 이 트랜잭션에 묶이지 않는다: DB 복원(이 RPC)은 단일 트랜잭션이지만 Storage 객체 업로드는 별개 시스템이다.
--   안전 순서(클라이언트): dry-run → Storage 업로드(덮어쓰기 금지) → 업로드 검증(sha256) → DB 복원 → 실패 시 업로드한 객체 정리.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public._backup_tables();
drop function if exists public._backup_schema_version();
drop function if exists public.admin_backup_export();

create or replace function public._backup_tables(p_mode text default 'core')
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_core text[] := array['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests',
               'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history',
               'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs'];
begin
  if p_mode = 'core' then return v_core; end if;
  if p_mode = 'full' then
    return v_core || array['purchase_request_logs', 'purchase_request_reagent_items', 'purchase_request_goods_items', 'purchase_requests',
                           'notices', 'notice_files', 'resource_files', 'app_settings'];
  end if;
  raise exception '알 수 없는 백업 모드입니다: % (core | full)', p_mode;
end;
$$;
revoke all on function public._backup_tables(text) from public, anon, authenticated;

-- 복원/백업을 허용하는 app_settings 키(그 외는 전부 제외). 비밀번호·토큰·비밀키 성격의 이름은 allowlist 에 있어도 거부한다.
create or replace function public._backup_settings_allowlist()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['lab_name', 'lab_professor', 'lab_assistant', 'lab_phone', 'safety_dept_phone', 'emergency_contact',
               'school_safety_system_url', 'kosha_label_url', 'quick_links']::text[];
$$;
revoke all on function public._backup_settings_allowlist() from public, anon, authenticated;

create or replace function public._is_backup_setting_key(p_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_key = any (public._backup_settings_allowlist()) and p_key !~* '(pass|pwd|token|secret|api[_-]?key|private|credential)';
$$;
revoke all on function public._is_backup_setting_key(text) from public, anon, authenticated;

-- 백업 대상 행을 고르는 FROM 조각(app_settings 만 allowlist 로 제한)
create or replace function public._backup_from(p_table text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_table = 'app_settings'
              then '(select * from public.app_settings where public._is_backup_setting_key(key)) x'
              else format('public.%I x', p_table) end;
$$;
revoke all on function public._backup_from(text) from public, anon, authenticated;

-- 모드별 (이름:컬럼:타입) 목록 해시 — 백업과 복원 대상의 스키마가 같은지 확인하는 schema_version.
create or replace function public._backup_schema_version(p_mode text default 'core')
returns text
language sql
stable
set search_path = public
as $$
  select 'v1-' || substr(md5(string_agg(t || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by t, a.attnum)), 1, 12)
    from unnest(public._backup_tables(p_mode)) t
    join pg_attribute a on a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped;
$$;
revoke all on function public._backup_schema_version(text) from public, anon, authenticated;

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
  if not (p_table = any (public._backup_tables('full'))) then raise exception '백업 범위 밖 테이블입니다: %', p_table; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s', public._backup_from(p_table)) into v_rows;
  return public._rows_digest(v_rows);
end;
$$;
revoke all on function public._table_digest(text) from public, anon, authenticated;

-- ── URL 도우미: Storage 공개 URL 에서 (bucket, path) 를 뽑는다 ─────────────────────────────────
create or replace function public._url_decode(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(convert_from(string_agg(case when m[1] ~ '^%[0-9A-Fa-f]{2}$' then decode(substr(m[1], 2), 'hex') else convert_to(m[1], 'UTF8') end, ''::bytea order by ord), 'UTF8'), '')
    from regexp_matches(p_text, '(%[0-9A-Fa-f]{2}|[^%]+|%)', 'g') with ordinality as t(m, ord);
$$;
revoke all on function public._url_decode(text) from public, anon, authenticated;

-- payload(테이블별 행 jsonb)에서 Storage 객체 참조를 모은다: notice_files.file_url, notices.file_url,
-- resource_files.storage_path/file_url, reagents.msds_url (같은 (bucket,path)는 refs 로 합침). 외부 URL 은 참조가 아님.
create or replace function public._storage_refs(p_tables jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_out jsonb;
begin
  with raw as (
    select 'notice_files'::text as tbl, 'file_url'::text as col, e->>'id' as id, e->>'file_url' as url, null::text as sp
      from jsonb_array_elements(coalesce(p_tables->'notice_files', '[]'::jsonb)) e
    union all
    select 'notices', 'file_url', e->>'id', e->>'file_url', null
      from jsonb_array_elements(coalesce(p_tables->'notices', '[]'::jsonb)) e
    union all
    select 'resource_files', 'file_url', e->>'id', e->>'file_url', null
      from jsonb_array_elements(coalesce(p_tables->'resource_files', '[]'::jsonb)) e
    union all
    select 'resource_files', 'storage_path', e->>'id', null, e->>'storage_path'
      from jsonb_array_elements(coalesce(p_tables->'resource_files', '[]'::jsonb)) e
    union all
    select 'reagents', 'msds_url', e->>'id', e->>'msds_url', null
      from jsonb_array_elements(coalesce(p_tables->'reagents', '[]'::jsonb)) e
  ), parsed as (
    select tbl, col, id,
           case when sp is not null then 'documents'
                else substring(url from '/storage/v1/object/(?:public|authenticated)/([^/?#]+)/') end as bucket,
           case when sp is not null then sp
                else public._url_decode(substring(url from '/storage/v1/object/(?:public|authenticated)/[^/?#]+/([^?#]+)')) end as path
      from raw
     where (sp is not null and sp <> '') or (url is not null and url ~ '/storage/v1/object/(public|authenticated)/[^/?#]+/[^?#]+')
  )
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'path', path, 'refs', refs) order by bucket, path), '[]'::jsonb)
    into v_out
    from (select bucket, path, jsonb_agg(jsonb_build_object('table', tbl, 'column', col, 'id', id) order by tbl, col, id) as refs
            from parsed where bucket is not null and path is not null and path <> '' group by bucket, path) g;
  return v_out;
end;
$$;
revoke all on function public._storage_refs(jsonb) from public, anon, authenticated;

-- Storage 기준 URL(source) → 복원 대상 프로젝트(target) 로 URL 컬럼을 바꾼다(다른 프로젝트로 복원할 때).
create or replace function public._rewrite_storage_urls(p_table text, p_rows jsonb, p_from text, p_to text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_col text := case p_table when 'notice_files' then 'file_url' when 'notices' then 'file_url' when 'resource_files' then 'file_url' when 'reagents' then 'msds_url' else null end;
begin
  if v_col is null or p_from is null or p_to is null or p_from = p_to or p_from = '' then return p_rows; end if;
  return coalesce((select jsonb_agg(case when e->>v_col like p_from || '%'
                                         then jsonb_set(e, array[v_col], to_jsonb(p_to || substr(e->>v_col, length(p_from) + 1)))
                                         else e end order by ord)
                     from jsonb_array_elements(p_rows) with ordinality as t(e, ord)), '[]'::jsonb);
end;
$$;
revoke all on function public._rewrite_storage_urls(text, jsonb, text, text) from public, anon, authenticated;

-- ── 복원 활성 여부 / 대상 상태 ────────────────────────────────────────────────
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
  return jsonb_build_object('enabled', coalesce(v_enabled, false),
    'modes', jsonb_build_object('core', jsonb_build_object('schema_version', public._backup_schema_version('core'), 'tables', to_jsonb(public._backup_tables('core'))),
                                'full', jsonb_build_object('schema_version', public._backup_schema_version('full'), 'tables', to_jsonb(public._backup_tables('full')))));
end;
$$;
revoke all on function public.admin_restore_status() from public, anon;
grant execute on function public.admin_restore_status() to authenticated;

-- 대상이 "비어 있는가"(복원 가능 상태 확인 / 중단된 복원의 Storage 정리 가능 여부 판단)
create or replace function public.admin_restore_target_state(p_mode text default 'core')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text; v_n bigint; v_counts jsonb := '{}'::jsonb; v_empty boolean := true;
begin
  perform public._admin_actor();
  foreach t in array public._backup_tables(p_mode) loop
    execute format('select count(*) from %s', public._backup_from(t)) into v_n;
    v_counts := v_counts || jsonb_build_object(t, v_n);
    if t <> 'app_settings' and v_n > 0 then v_empty := false; end if;
  end loop;
  return jsonb_build_object('mode', p_mode, 'empty', v_empty, 'counts', v_counts);
end;
$$;
revoke all on function public.admin_restore_target_state(text) from public, anon;
grant execute on function public.admin_restore_target_state(text) to authenticated;

-- ── 백업 스냅샷 ───────────────────────────────────────────────────────────────
create or replace function public.admin_backup_export(p_mode text default 'core')
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
  v_out jsonb;
begin
  perform public._admin_actor();
  foreach t in array public._backup_tables(p_mode) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s', public._backup_from(t)) into v_rows;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
    v_counts := v_counts || jsonb_build_object(t, jsonb_array_length(v_rows));
    v_digests := v_digests || jsonb_build_object(t, public._rows_digest(v_rows));
    v_cols := v_cols || jsonb_build_object(t, public._backup_columns(t));
  end loop;
  v_out := jsonb_build_object(
    'backup_version', 1, 'backup_mode', p_mode, 'created_at', now(), 'schema_version', public._backup_schema_version(p_mode),
    'table_order', to_jsonb(public._backup_tables(p_mode)), 'table_counts', v_counts, 'table_digests', v_digests,
    'table_columns', v_cols, 'tables', v_tables);
  if p_mode = 'full' then v_out := v_out || jsonb_build_object('storage_refs', public._storage_refs(v_tables)); end if;
  return v_out;
end;
$$;
revoke all on function public.admin_backup_export(text) from public, anon;
grant execute on function public.admin_backup_export(text) to authenticated;

-- ── 전체 복원(빈 대상) ────────────────────────────────────────────────────────
-- p_dry_run = true(기본): 검증 + 실제 삽입을 시도한 뒤 "항상 롤백"(쓰기 0). false: 커밋 — restore_enabled 와 p_confirm='RESTORE' 필요.
-- p_storage_base_from/to: 다른 프로젝트로 복원할 때 URL 컬럼의 Storage 기준 주소를 바꾼다(같으면 그대로).
drop function if exists public.admin_restore_full(jsonb, boolean, text);
create or replace function public.admin_restore_full(
  p_payload jsonb, p_dry_run boolean default true, p_confirm text default null,
  p_storage_base_from text default null, p_storage_base_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_mode text := coalesce(p_payload->>'backup_mode', 'core');
  v_tables text[];
  v_payload_tables jsonb := '{}'::jsonb;
  v_expect jsonb := '{}'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_inserted jsonb := '{}'::jsonb;
  v_digests jsonb := '{}'::jsonb;
  v_error text := null;
  v_enabled boolean := false;
  t text; k text;
  v_rows jsonb; v_rw jsonb;
  v_n bigint;
  rec record;
  v_sql text;
  v_pk text;
  v_cols text; v_pcols text; v_nn text;
  v_bad text[];
begin
  v_actor := public._admin_actor();
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception '백업 데이터 형식이 올바르지 않습니다.'; end if;
  if v_mode not in ('core', 'full') then raise exception '알 수 없는 백업 모드입니다: %', v_mode; end if;
  v_tables := public._backup_tables(v_mode);
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
  if (p_payload->>'schema_version') is distinct from public._backup_schema_version(v_mode) then
    v_issues := v_issues || jsonb_build_object('code', 'schema_version', 'message', 'schema_version 불일치 — 백업: ' || coalesce(p_payload->>'schema_version', '없음') || ' / 현재 DB: ' || public._backup_schema_version(v_mode));
  end if;
  if jsonb_typeof(p_payload->'tables') is distinct from 'object' then
    v_issues := v_issues || jsonb_build_object('code', 'tables', 'message', 'tables 항목이 없습니다.');
  else
    for k in select jsonb_object_keys(p_payload->'tables') loop
      if not (k = any (v_tables)) then v_issues := v_issues || jsonb_build_object('code', 'unknown_table', 'table', k, 'message', '이 백업 모드의 복원 범위 밖 테이블이 들어 있습니다.'); end if;
    end loop;
  end if;

  if jsonb_array_length(v_issues) = 0 then
    -- 2) URL 재작성(다른 프로젝트) 반영본을 만들고, 그 기준으로 검증/삽입한다
    foreach t in array v_tables loop
      v_rows := p_payload->'tables'->t;
      if jsonb_typeof(v_rows) is distinct from 'array' then
        v_issues := v_issues || jsonb_build_object('code', 'missing_table', 'table', t, 'message', '테이블 데이터가 없습니다.'); continue;
      end if;
      v_rw := v_rows;
      if v_mode = 'full' then v_rw := public._rewrite_storage_urls(t, v_rows, p_storage_base_from, p_storage_base_to); end if;
      v_payload_tables := v_payload_tables || jsonb_build_object(t, v_rw);
      if v_rw is distinct from v_rows then v_expect := v_expect || jsonb_build_object(t, public._rows_digest(v_rw)); end if;   -- 재작성된 행 기준 기대 digest
    end loop;
  end if;

  if jsonb_array_length(v_issues) = 0 then
    -- 3) 테이블별: 행 수 / 컬럼 / 빈 대상 / PK 중복 / (app_settings) allowlist·충돌
    foreach t in array v_tables loop
      v_rows := v_payload_tables->t;
      if jsonb_array_length(v_rows) <> coalesce((p_payload->'table_counts'->>t)::bigint, -1) then
        v_issues := v_issues || jsonb_build_object('code', 'count_mismatch', 'table', t, 'message', format('행 수가 manifest 와 다릅니다 (파일 %s / manifest %s).', jsonb_array_length(v_rows), p_payload->'table_counts'->>t));
      end if;
      if (p_payload->'table_columns'->t) is distinct from public._backup_columns(t) then
        v_issues := v_issues || jsonb_build_object('code', 'columns', 'table', t, 'message', '컬럼 구성이 현재 DB 와 다릅니다.');
      end if;
      if t = 'app_settings' then
        select coalesce(array_agg(e->>'key'), '{}') into v_bad from jsonb_array_elements(v_rows) e where not public._is_backup_setting_key(e->>'key');
        if array_length(v_bad, 1) > 0 then
          v_issues := v_issues || jsonb_build_object('code', 'settings_not_allowed', 'table', t, 'keys', to_jsonb(v_bad), 'message', '복원이 허용되지 않은 설정 키가 들어 있습니다(비밀번호/토큰 등은 복원하지 않음).');
        end if;
        select coalesce(array_agg(p.key), '{}') into v_bad
          from jsonb_populate_recordset(null::public.app_settings, v_rows) p
          join public.app_settings a on a.key = p.key
         where coalesce(a.value, '') <> '' and a.value is distinct from p.value;
        if array_length(v_bad, 1) > 0 then
          v_issues := v_issues || jsonb_build_object('code', 'settings_conflict', 'table', t, 'keys', to_jsonb(v_bad), 'message', '대상에 이미 다른 값의 설정이 있어 덮어쓰지 않습니다.');
        end if;
      else
        execute format('select count(*) from public.%I', t) into v_n;
        if v_n > 0 then
          v_issues := v_issues || jsonb_build_object('code', 'target_not_empty', 'table', t, 'count', v_n, 'message', '대상 테이블이 비어 있지 않습니다(전체 복원은 빈 대상에만 가능).');
        end if;
      end if;
      select string_agg(format('%I', a.attname), ', ' order by k2.ord) into v_pk
        from pg_index i
        join lateral unnest(i.indkey::int2[]) with ordinality k2(attnum, ord) on true
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k2.attnum
       where i.indrelid = format('public.%I', t)::regclass and i.indisprimary;
      if v_pk is not null then
        execute format('select count(*) from (select 1 from jsonb_populate_recordset(null::public.%I, $1) group by %s having count(*) > 1) d', t, v_pk) into v_n using v_rows;
        if v_n > 0 then v_issues := v_issues || jsonb_build_object('code', 'duplicate_pk', 'table', t, 'count', v_n, 'message', '기본키(PK) 중복이 있습니다.'); end if;
      end if;
    end loop;
  end if;

  -- 4) FK 무결성(범위 안 테이블 사이) — 존재하지 않는 부모 참조 (구매요청 → students/reagents/logs, notice_files → notices 포함)
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
      select string_agg(format('c.%I', a.attname), ', ' order by k2.ord), string_agg(format('c.%I is not null', a.attname), ' and ' order by k2.ord)
        into v_cols, v_nn
        from pg_constraint c2 join lateral unnest(c2.conkey) with ordinality k2(attnum, ord) on true
        join pg_attribute a on a.attrelid = c2.conrelid and a.attnum = k2.attnum where c2.oid = rec.oid;
      select string_agg(format('p.%I', a.attname), ', ' order by k2.ord) into v_pcols
        from pg_constraint c2 join lateral unnest(c2.confkey) with ordinality k2(attnum, ord) on true
        join pg_attribute a on a.attrelid = c2.confrelid and a.attnum = k2.attnum where c2.oid = rec.oid;
      v_sql := format('with c as materialized (select %s from jsonb_populate_recordset(null::public.%I, $1) c where %s), p as materialized (select %s from jsonb_populate_recordset(null::public.%I, $2) p) select count(*) from c where not exists (select 1 from p where (%s) = (%s))',
                      v_cols, rec.child, v_nn, v_pcols, rec.parent, v_pcols, v_cols);
      execute v_sql into v_n using v_payload_tables->rec.child, v_payload_tables->rec.parent;
      if v_n > 0 then
        v_issues := v_issues || jsonb_build_object('code', 'fk_orphan', 'table', rec.child, 'count', v_n, 'message', format('존재하지 않는 %s 를 참조하는 행이 %s건 있습니다.', rec.parent, v_n));
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_issues) > 0 then
    return jsonb_build_object('ok', false, 'dry_run', p_dry_run, 'committed', false, 'mode', v_mode, 'issues', v_issues);
  end if;

  -- 5) 삽입(부모 → 자식) + digest 검증. dry-run 은 마지막에 의도적으로 예외를 던져 서브트랜잭션째 롤백한다.
  begin
    foreach t in array v_tables loop
      if t = 'app_settings' then
        -- 없는 키만 삽입, 비어 있는 기본값은 채움. 다른 값이 있는 키는 위에서 이미 충돌로 차단됨(덮어쓰기 없음).
        execute 'insert into public.app_settings select * from jsonb_populate_recordset(null::public.app_settings, $1) p where not exists (select 1 from public.app_settings a where a.key = p.key)' using v_payload_tables->t;
        get diagnostics v_n = row_count;
        update public.app_settings a set value = p.value
          from jsonb_populate_recordset(null::public.app_settings, v_payload_tables->t) p
         where a.key = p.key and coalesce(a.value, '') = '' and p.value is distinct from a.value;
      else
        execute format('insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I, $1)', t, t) using v_payload_tables->t;
        get diagnostics v_n = row_count;
        if v_n <> (p_payload->'table_counts'->>t)::bigint then raise exception '삽입 행 수 불일치(%): % / %', t, v_n, p_payload->'table_counts'->>t; end if;
      end if;
      v_inserted := v_inserted || jsonb_build_object(t, v_n);
      v_digests := v_digests || jsonb_build_object(t, public._table_digest(t));
      if (v_digests->>t) is distinct from coalesce(v_expect->>t, p_payload->'table_digests'->>t) then
        raise exception 'digest 불일치(%): 복원본이 백업 원본과 다릅니다.', t;
      end if;
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
    return jsonb_build_object('ok', v_error is null, 'dry_run', true, 'committed', false, 'error', v_error, 'mode', v_mode,
                              'would_insert', v_inserted, 'digests_match', v_error is null,
                              'storage_refs', case when v_mode = 'full' then public._storage_refs(v_payload_tables) else '[]'::jsonb end);
  end if;

  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '전체 복원 실행', 'backup', '모드 ' || v_mode || ' · 테이블 ' || array_length(v_tables, 1) || '개 복원(digest 검증 통과)');
  return jsonb_build_object('ok', true, 'dry_run', false, 'committed', true, 'mode', v_mode, 'inserted', v_inserted, 'digests_match', true,
                            'storage_refs', case when v_mode = 'full' then public._storage_refs(v_payload_tables) else '[]'::jsonb end);
end;
$$;
revoke all on function public.admin_restore_full(jsonb, boolean, text, text, text) from public, anon;
grant execute on function public.admin_restore_full(jsonb, boolean, text, text, text) to authenticated;
