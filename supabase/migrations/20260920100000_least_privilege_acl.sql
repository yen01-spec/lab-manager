-- ════════════════════════════════════════════════════════════════════════
-- Master Finish Phase 3/4 — 테이블별 최소권한(ACL + RLS) 재구성 + 구매요청/조회수 RPC.
--
-- ⚠️ staging에만 적용. production 미적용(관리자 Auth 계정이 생긴 뒤 별도 Gate에서 적용).
--
-- 왜: production은 거의 모든 테이블에 `allow all ... using(true) to public` 정책이 남아 있고
--   anon/authenticated 에 SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER 전부 부여돼 있다.
--   PERMISSIVE 정책은 OR 로 결합되므로 옆에 있는 `auth.role()='authenticated'` 류 제한 정책은
--   실질적으로 무효였다(누구나 anon 키만으로 TRUNCATE/DELETE 가능).
--
-- 방식(테이블 단위로 "기존 정책 전부 삭제 → 필요한 권한/정책만 재생성"):
--   public_read_admin_write : 읽기는 공개, 쓰기는 Supabase Auth 관리자(public.is_admin())만.
--   admin_only              : 읽기/쓰기 모두 관리자만.
--   open_rw                 : hazard_ledger_notes 만 — 로그인 없이 누구나 편집하던 문서 준비 메모(업무 결정 대기).
--   RPC 전용(직접 쓰기 없음)  : inventory_*(20260920120000), stock_logs/location_history(서버 생성 감사기록,
--                             20260920130000) — 클라이언트 롤은 SELECT 만.
--   구매요청/조회수: 별도 RPC. 그 외 특수 테이블은 개별 처리.
-- production에 없는 테이블은 to_regclass 로 건너뛴다(같은 파일이 staging fixture/production 모두에서 동작).
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  cfg jsonb := $cfg$[
    {"t":"lab_rules","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"safety_briefings","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"notices","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"notice_files","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"calendar_events","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"label_phrase_template","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"label_size_rule","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"signage_master","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"school_chemical_master","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"regulation_document","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"special_material_logs","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"items","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"item_lots","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"item_locations","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"locations","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"receipts","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"stock_history","mode":"public_read_admin_write","ops":["insert","update","delete"]},
    {"t":"purchase_requests","mode":"public_read_admin_write","ops":["update","delete"]},
    {"t":"purchase_request_logs","mode":"public_read_admin_write","ops":[]},
    {"t":"purchase_request_reagent_items","mode":"public_read_admin_write","ops":[]},
    {"t":"purchase_request_goods_items","mode":"public_read_admin_write","ops":[]},
    {"t":"admin_logs","mode":"admin_only","ops":["insert"]},
    {"t":"reagent_import_history","mode":"admin_only","ops":["insert","update","delete"]},
    {"t":"reagents","mode":"public_read_admin_write","ops":["insert","update"]},
    {"t":"reagent_lots","mode":"public_read_admin_write","ops":["insert","update"]},
    {"t":"stock_logs","mode":"public_read_admin_write","ops":[]},
    {"t":"location_history","mode":"public_read_admin_write","ops":[]},
    {"t":"inventory_sessions","mode":"public_read_admin_write","ops":[]},
    {"t":"inventory_counts","mode":"public_read_admin_write","ops":[]},
    {"t":"inventory_assignments","mode":"public_read_admin_write","ops":[]},
    {"t":"hazard_ledger_notes","mode":"open_rw","ops":["insert","update"]}
  ]$cfg$;
  item jsonb;
  v_t text; v_mode text; v_op text; pol record;
begin
  for item in select * from jsonb_array_elements(cfg) loop
    v_t := item->>'t'; v_mode := item->>'mode';
    if to_regclass('public.' || v_t) is null then continue; end if;

    execute format('alter table public.%I enable row level security', v_t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = v_t loop
      execute format('drop policy %I on public.%I', pol.policyname, v_t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', v_t);

    if v_mode = 'public_read_admin_write' then
      execute format('grant select on public.%I to anon, authenticated', v_t);
      execute format('create policy %I on public.%I for select to anon, authenticated using (true)', v_t || '_read', v_t);
    elsif v_mode = 'admin_only' then
      execute format('grant select on public.%I to authenticated', v_t);
      execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', v_t || '_admin_read', v_t);
    elsif v_mode = 'open_rw' then
      execute format('grant select on public.%I to anon, authenticated', v_t);
      execute format('create policy %I on public.%I for select to anon, authenticated using (true)', v_t || '_read', v_t);
    end if;

    for v_op in select jsonb_array_elements_text(item->'ops') loop
      if v_mode = 'open_rw' then
        execute format('grant %s on public.%I to anon, authenticated', v_op, v_t);
        if v_op = 'insert' then
          execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', v_t || '_open_insert', v_t);
        elsif v_op = 'update' then
          execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', v_t || '_open_update', v_t);
        else
          execute format('create policy %I on public.%I for delete to anon, authenticated using (true)', v_t || '_open_delete', v_t);
        end if;
      else
        execute format('grant %s on public.%I to authenticated', v_op, v_t);
        if v_op = 'insert' then
          execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', v_t || '_admin_insert', v_t);
        elsif v_op = 'update' then
          execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', v_t || '_admin_update', v_t);
        else
          execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', v_t || '_admin_delete', v_t);
        end if;
      end if;
    end loop;
  end loop;
end $$;


-- ── fcm_tokens: 기기 토큰 등록은 비로그인 기기도 해야 하므로 INSERT/UPDATE 공개 유지, 삭제만 관리자 ──
do $$
declare pol record;
begin
  if to_regclass('public.fcm_tokens') is null then return; end if;
  alter table public.fcm_tokens enable row level security;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'fcm_tokens' loop
    execute format('drop policy %I on public.fcm_tokens', pol.policyname);
  end loop;
  revoke all on public.fcm_tokens from anon, authenticated;
  grant select, insert, update on public.fcm_tokens to anon, authenticated;
  grant delete on public.fcm_tokens to authenticated;
  create policy fcm_tokens_read on public.fcm_tokens for select to anon, authenticated using (true);
  create policy fcm_tokens_device_insert on public.fcm_tokens for insert to anon, authenticated with check (true);
  create policy fcm_tokens_device_update on public.fcm_tokens for update to anon, authenticated using (true) with check (true);
  create policy fcm_tokens_admin_delete on public.fcm_tokens for delete to authenticated using (public.is_admin());
end $$;


-- ── app_settings: 값 변경은 관리자만(관리자 PIN 키는 어떤 경로로도 쓰지 못함) ──
do $$
begin
  if to_regclass('public.app_settings') is null then return; end if;
  grant insert, update on public.app_settings to authenticated;
  drop policy if exists app_settings_admin_insert on public.app_settings;
  create policy app_settings_admin_insert on public.app_settings
    for insert to authenticated with check (public.is_admin() and key <> 'admin_password');
  drop policy if exists app_settings_admin_update on public.app_settings;
  create policy app_settings_admin_update on public.app_settings
    for update to authenticated using (public.is_admin() and key <> 'admin_password')
    with check (public.is_admin() and key <> 'admin_password');
end $$;


-- ── 공지 조회수: 누구나 보는 화면이라 anon UPDATE 대신 "+1만" 가능한 RPC ──
create or replace function public.notice_increment_views(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notices set views = coalesce(views, 0) + 1 where id = p_id;
$$;
revoke all on function public.notice_increment_views(uuid) from public;
grant execute on function public.notice_increment_views(uuid) to anon, authenticated;


-- ── 구매요청서 제출(신 시스템: purchase_request_logs + 시약/물품 항목) — 한 트랜잭션 RPC ──
-- 로그인하지 않은 제출은 기존에도 가능했다(requested_by=null). 그 의미를 보존한다:
--   토큰 없음  → requested_by = null (익명 요청)
--   토큰 있음  → 유효해야 하며, requested_by 는 서버가 세션으로 확정(client 값 무시/위조 불가)
create or replace function public.purchase_request_submit(
  p_session_token text, p_reagent_items jsonb, p_goods_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student_id text := null;
  v_id uuid;
  v_r jsonb := coalesce(p_reagent_items, '[]'::jsonb);
  v_g jsonb := coalesce(p_goods_items, '[]'::jsonb);
begin
  if p_session_token is not null and length(p_session_token) > 0 then
    v_student_id := public._resolve_student_session(p_session_token);
  end if;
  if jsonb_typeof(v_r) <> 'array' or jsonb_typeof(v_g) <> 'array' then
    raise exception '항목 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(v_r) + jsonb_array_length(v_g) = 0 then
    raise exception '담긴 항목이 없습니다.';
  end if;
  if jsonb_array_length(v_r) + jsonb_array_length(v_g) > 200 then
    raise exception '한 번에 200개까지만 요청할 수 있습니다.';
  end if;

  insert into public.purchase_request_logs (requested_by) values (v_student_id) returning id into v_id;

  if jsonb_array_length(v_r) > 0 then
    insert into public.purchase_request_reagent_items
      (request_id, reagent_id, name, purity, cas_no, state, needed_amount, usage_place, purchase_reason, company, cat_no, spec, quantity, note)
    select request_id, reagent_id, name, purity, cas_no, state, needed_amount, usage_place, purchase_reason, company, cat_no, spec, quantity, note
      from jsonb_populate_recordset(null::public.purchase_request_reagent_items,
      (select jsonb_agg((select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(e) as t(k, v)
                          where k = any (array['reagent_id','name','purity','cas_no','state','needed_amount','usage_place','purchase_reason','company','cat_no','spec','quantity','note']))
                        || jsonb_build_object('request_id', v_id))
         from jsonb_array_elements(v_r) e));
  end if;
  if jsonb_array_length(v_g) > 0 then
    insert into public.purchase_request_goods_items
      (request_id, name, cat_no, spec, quantity, unit_price, shipping_fee, total_price, purpose, note, link)
    select request_id, name, cat_no, spec, quantity, unit_price, shipping_fee, total_price, purpose, note, link
      from jsonb_populate_recordset(null::public.purchase_request_goods_items,
      (select jsonb_agg((select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(e) as t(k, v)
                          where k = any (array['name','cat_no','spec','quantity','unit_price','shipping_fee','total_price','purpose','note','link']))
                        || jsonb_build_object('request_id', v_id))
         from jsonb_array_elements(v_g) e));
  end if;

  return jsonb_build_object('id', v_id, 'requested_by', v_student_id);
end;
$$;
revoke all on function public.purchase_request_submit(text, jsonb, jsonb) from public;
grant execute on function public.purchase_request_submit(text, jsonb, jsonb) to anon, authenticated;


-- ── 구매요청서 상태 변경(관리자) — approved_by/타임스탬프는 서버가 확정 ──
-- p_status null → 배송정보(운송장/도착예정)만 저장. 상태 전이 규칙은 기존 화면이 강제하던 것이 없어
-- 허용 상태 집합만 검증한다(업무 규칙이 확정되면 여기서 강화).
create or replace function public.purchase_request_log_update(
  p_id uuid, p_status text, p_note text, p_tracking_number text, p_estimated_arrival text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_eta_type text;
  v_now timestamptz := now();
  v_rows int;
begin
  v_actor := public._admin_actor();
  if p_status is not null and p_status not in ('pending', 'approved', 'ordered', 'delivered', 'rejected', 'done') then
    raise exception '알 수 없는 상태입니다.';
  end if;
  select format_type(a.atttypid, a.atttypmod) into v_eta_type
    from pg_attribute a
   where a.attrelid = 'public.purchase_request_logs'::regclass and a.attname = 'estimated_arrival' and not a.attisdropped;

  if p_status is null then
    execute format('update public.purchase_request_logs set tracking_number = $1, estimated_arrival = nullif($2, '''')::%s where id = $3', v_eta_type)
      using nullif(p_tracking_number, ''), p_estimated_arrival, p_id;
  else
    execute format($f$update public.purchase_request_logs set
        status = $1,
        reject_note = coalesce($2, reject_note),
        approved_by = $3,
        ordered_at = case when $1 = 'ordered' then $4 else ordered_at end,
        tracking_number = case when $1 = 'ordered' then nullif($5, '') else tracking_number end,
        estimated_arrival = case when $1 = 'ordered' then nullif($6, '')::%s else estimated_arrival end,
        delivered_at = case when $1 = 'delivered' then $4 else delivered_at end
      where id = $7$f$, v_eta_type)
      using p_status, nullif(p_note, ''), v_actor, v_now, p_tracking_number, p_estimated_arrival, p_id;
  end if;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception '존재하지 않는 구매요청입니다.'; end if;
  insert into public.admin_logs (admin_name, action, target_type, description)
    values (v_actor, '구매요청 처리', 'purchase', coalesce(p_status, '배송정보 저장') || ': ' || p_id::text);
  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;
revoke all on function public.purchase_request_log_update(uuid, text, text, text, text) from public, anon;
grant execute on function public.purchase_request_log_update(uuid, text, text, text, text) to authenticated;


-- ── Storage: documents 버킷 — 읽기 공개, 쓰기/수정/삭제는 관리자만 ──
-- 기존 "public upload/update/delete" 는 버킷 전체를 누구나 쓰고 지울 수 있게 열어두고 있었고,
-- resources/ 경로의 관리자 전용 정책은 OR 결합 때문에 무효였다.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and (coalesce(qual, '') like '%documents%' or coalesce(with_check, '') like '%documents%') loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
  create policy documents_public_read on storage.objects for select to public using (bucket_id = 'documents');
  create policy documents_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.is_admin());
  create policy documents_admin_update on storage.objects for update to authenticated using (bucket_id = 'documents' and public.is_admin()) with check (bucket_id = 'documents' and public.is_admin());
  create policy documents_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.is_admin());
end $$;


-- ── 최종 안전망 ──────────────────────────────────────────────────────────────
-- (1) 관리자 명단/동기화 기록: 쓰기 권한 자체를 회수(읽기는 기존 RLS 정책이 본인/관리자만 허용).
do $$
begin
  if to_regclass('public.admin_users') is not null then
    revoke all on public.admin_users from anon, authenticated;
    grant select on public.admin_users to authenticated;
  end if;
  if to_regclass('public.inventory_snapshot_syncs') is not null then
    revoke all on public.inventory_snapshot_syncs from anon, authenticated;
    grant select on public.inventory_snapshot_syncs to authenticated;
  end if;
end $$;

-- (2) 위 구성에 없는 나머지 public 테이블도 TRUNCATE/REFERENCES/TRIGGER 는 클라이언트 롤에서 회수
--     (앱이 쓰는 연산이 아니며 PostgREST로 노출되진 않지만 최소권한 원칙).
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;
