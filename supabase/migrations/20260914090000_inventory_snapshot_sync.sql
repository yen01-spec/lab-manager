-- ════════════════════════════════════════════════════════════════════════
-- 현재 재고 Excel 동기화 (Inventory Snapshot Sync) — Phase 4b-3a.
--
-- ⚠️ 이 migration은 작성만 하고 이번 단계에서 운영 DB에 적용(supabase db push)하지
--    않는다. 4b-3b에서 사람이 최종 검토한 뒤 별도로 적용한다.
--
-- 목적: 연 1회 등 "현재 재고 전체"를 Excel 기준으로 동기화하는 관리자 전용 RPC.
-- 기존 데이터/이력을 절대 DELETE하지 않는다 — 전부 UPDATE 또는 신규 INSERT만 한다.
-- destructive rebuild(scripts/rebuild-from-excel.mjs, import-inventory-2026-2.mjs의
-- 삭제-후-재삽입 방식)와는 완전히 다르다.
-- ════════════════════════════════════════════════════════════════════════


-- ── A) reagent_lots.status에 'not_in_snapshot' 추가 ───────────────────────
-- 의미: 이번 전체 재고 snapshot에는 없지만 폐기/분실로 "확정"된 것은 아님(§Phase 4b-1/4b-3a
-- 정책). 사용자 UI 문구는 "현재 목록 제외". used_up/disposed/missing과는 별개 — 저 셋은
-- 이미 확정적 상태 판단이 있었던 경우라 이번 snapshot 비교 대상에서 아예 제외한다(아래
-- RPC의 not_in_snapshot 전환 대상은 오직 status='active'인 Lot만).
alter table reagent_lots drop constraint if exists reagent_lots_status_check;
alter table reagent_lots add constraint reagent_lots_status_check
  check (status in ('active', 'used_up', 'disposed', 'missing', 'not_in_snapshot'));

comment on column reagent_lots.status is
  '''active''(보유중) | ''used_up''(정상 사용완료) | ''disposed''(폐기 처리) | ''missing''(실사에서 미확인/분실) | ''not_in_snapshot''(현재 재고 동기화 시 Excel에 없었음 — 폐기 확정 아님, 다음 동기화에서 다시 나타나면 active로 복구). 삭제 대신 상태만 바꿔 이력을 보존한다.';


-- ── B) 감사 테이블 ─────────────────────────────────────────────────────
-- 성공한 전체 재고 동기화 실행만 기록(실패/중단은 기록하지 않음 — transaction 전체가
-- rollback되므로 애초에 남지 않음). 원본 Excel 바이너리는 저장하지 않는다(파일명만).
create table if not exists inventory_snapshot_syncs (
  id                          uuid primary key default gen_random_uuid(),
  snapshot_id                 uuid not null unique,
  executed_by                 uuid references auth.users(id),
  executed_at                 timestamptz not null default now(),
  source_filename             text,
  source_row_count            integer,
  updated_lot_count           integer not null default 0,
  new_lot_count               integer not null default 0,
  not_in_snapshot_lot_count   integer not null default 0,
  reactivated_lot_count       integer not null default 0,
  new_reagent_count           integer not null default 0,
  archived_reagent_count      integer not null default 0,
  reactivated_reagent_count   integer not null default 0,
  warning_count               integer not null default 0,
  summary                     jsonb,
  created_at                  timestamptz not null default now()
);
comment on table inventory_snapshot_syncs is
  '현재 재고 Excel 동기화(sync_inventory_snapshot RPC) 성공 실행 기록. snapshot_id는 프론트가
   미리보기 생성 시 발급하는 UUID — unique 제약으로 같은 snapshot을 두 번 적용하지 못하게 막는다.';

-- snapshot_id 재실행 방지는 RPC 내부에서 명시적으로도 검사하지만, unique 제약을 걸어두면
-- 혹시 동시에 두 요청이 통과 검사를 지나쳐도 마지막 insert가 유니크 위반으로 확실히 막힌다.

alter table inventory_snapshot_syncs enable row level security;

drop policy if exists inventory_snapshot_syncs_admin_select on inventory_snapshot_syncs;
create policy inventory_snapshot_syncs_admin_select on inventory_snapshot_syncs
  for select to authenticated
  using (public.is_admin());
-- insert/update/delete 정책은 만들지 않는다 — RLS 기본값(거부)만 적용되어 어떤 role도
-- 이 표를 직접 쓸 수 없다. 유일한 쓰기 경로는 아래 SECURITY DEFINER 함수(소유자 postgres,
-- bypassrls)뿐이다.


-- ── C) 신규 시약 마스터 grouping 키 → INSERT 시 중복 생성 방지 ──────────
-- (RPC 안에서 트랜잭션 임시테이블로 처리 — 별도 영구 테이블 불필요.)


-- ── D) sync_inventory_snapshot RPC ────────────────────────────────────
-- 입력(payload jsonb) 개념(정확한 필드는 src/lib/inventorySnapshotMatch.js 참고):
-- {
--   snapshot_id, source_filename,
--   baseline_active_lot_ids: [uuid,...],
--   rows: [{
--     row_no, reagent_id, reagent_lot_id, match_confidence, new_reagent_key,
--     name, name_ko, cas_no, company, cat_no, purity, volume, unit,
--     lot_no, lot_source_hint, location_id, shelf_position,
--     received_date, expiry_date, current_stock, sealed_count,
--     company_action, expected_reagent_updated_at, expected_lot_updated_at
--   }]
-- }
--
-- 원칙:
--  - 프론트의 match_confidence/lot_source_hint는 "참고"일 뿐 신뢰하지 않는다 — 서버가
--    reagent_id/lot_id 존재, 관계, 위치, 숫자 범위, UUID 중복을 전부 다시 검증한다.
--  - 기존 reagent/lot row는 절대 DELETE+INSERT 하지 않고 UPDATE만 한다(id 보존).
--  - master 필드(name/name_ko/cas_no/purity/volume/unit/hazard 등)는 기존 EXACT reagent에
--    자동 덮어쓰지 않는다. company만 "비어있을 때 채우기"(fill_if_empty)를 명시적으로
--    허용된 경우에만 UPDATE한다.
--  - preview 이후 실제 재고가 바뀌었으면(다른 사용자가 수정) 조용히 진행하지 않고 전체 중단.
create or replace function public.sync_inventory_snapshot(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_source_filename text;
  v_rows jsonb;
  v_row_count int;
  v_baseline_raw text[];
  v_baseline_ids uuid[];
  v_current_active_ids uuid[];
  v_updated_lot_count int := 0;
  v_reactivated_lot_count int := 0;
  v_new_lot_count int := 0;
  v_not_in_snapshot_count int := 0;
  v_new_reagent_count int := 0;
  v_archived_reagent_count int := 0;
  v_reactivated_reagent_count int := 0;
  v_expected_match_count int;
  v_actual_match_count int;
  v_prefix text;
  v_seq int;
  v_new_id uuid;
  v_preview_warning_count int;
  rec record;
begin
  -- 1) 관리자 확인 — localStorage isAdmin은 신뢰하지 않는다. Supabase Auth 세션 +
  --    admin_users 기반 is_admin()만 최종 인가로 인정(자료 CMS와 동일 정책).
  if not public.is_admin() then
    raise exception '자료관리 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 2) 동시 실행 방지 — 트랜잭션 종료 시 자동 해제되는 xact advisory lock.
  --    errcode는 표준 SQLSTATE 55P03(lock_not_available) 사용 — 'LOCKED'는 PostgreSQL이
  --    인식하는 조건명/SQLSTATE가 아니라서(Phase 4b-3b-S1 db lint에서 42704로 발견) 이
  --    RAISE 자체가 런타임에 실패했었다(§Phase 4b-3b-S1.1에서 수정).
  if not pg_try_advisory_xact_lock(hashtext('inventory_snapshot_sync')) then
    raise exception '다른 관리자가 현재 재고 동기화를 진행 중입니다. 잠시 후 다시 시도해주세요.' using errcode = '55P03';
  end if;

  -- 3) payload 최상위 검증
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload 형식이 올바르지 않습니다.';
  end if;
  v_snapshot_id := nullif(payload->>'snapshot_id', '')::uuid;
  if v_snapshot_id is null then
    raise exception 'snapshot_id가 없습니다.';
  end if;
  v_source_filename := payload->>'source_filename';
  if v_source_filename is null or length(v_source_filename) = 0 or length(v_source_filename) > 300 then
    raise exception 'source_filename이 올바르지 않습니다.';
  end if;
  v_rows := payload->'rows';
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) = 0 then
    raise exception 'rows가 비어 있습니다.';
  end if;
  v_row_count := jsonb_array_length(v_rows);
  -- preview_warning_count는 순수 참고/감사용이다 — 보안이나 분기 로직에 절대 쓰지 않는다
  -- (프론트가 뭐라고 주장하든 실제 DB 반영 여부는 아래 검증들이 전부 독립적으로 결정한다).
  v_preview_warning_count := coalesce((payload->>'preview_warning_count')::int, 0);

  -- 4) 동일 snapshot_id 재실행 방지 — refresh/재시도로 같은 결과를 두 번 반영하지 않음.
  if exists (select 1 from inventory_snapshot_syncs where snapshot_id = v_snapshot_id) then
    raise exception '이미 적용된 재고 동기화 요청입니다.' using errcode = 'P0001';
  end if;

  -- 5) rows를 강한 타입의 임시 테이블로 전개(jsonb_to_recordset) — 여기서 malformed
  --    UUID/숫자/날짜는 자동으로 cast 오류가 나서 전체가 즉시 중단된다(§32: dynamic SQL
  --    대신 명시적 recordset 전개, EXECUTE format() 미사용).
  create temporary table snapshot_rows on commit drop as
  select *
  from jsonb_to_recordset(v_rows) as r(
    row_no int,
    reagent_id uuid,
    reagent_lot_id uuid,
    match_confidence text,
    new_reagent_key text,
    name text,
    name_ko text,
    cas_no text,
    company text,
    cat_no text,
    purity text,
    volume numeric,
    unit text,
    lot_no text,
    location_id uuid,
    shelf_position text,
    received_date date,
    expiry_date date,
    current_stock int,
    sealed_count int,
    company_action text,
    expected_reagent_updated_at timestamptz,
    expected_lot_updated_at timestamptz
  );

  if (select count(*) from snapshot_rows) <> v_row_count then
    raise exception 'rows 파싱 결과 행 수가 일치하지 않습니다.';
  end if;

  -- 6) 행별 정적 검증(서버 재검증 — 프론트 검증을 신뢰하지 않는다, §10/§29)
  if exists (select 1 from snapshot_rows where coalesce(name, '') = '' and coalesce(name_ko, '') = '') then
    raise exception '시약명(영문/국문)이 모두 없는 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where location_id is null) then
    raise exception '보관 위치가 없는 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows r where not exists (select 1 from locations l where l.id = r.location_id)) then
    raise exception '존재하지 않는 위치를 가리키는 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where current_stock is null or current_stock < 0 or current_stock > 100) then
    raise exception '현재 잔량이 0~100 범위를 벗어난 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where sealed_count is null or sealed_count < 0) then
    raise exception '미개봉 수량이 올바르지 않은 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where match_confidence not in ('exact', 'review_confirmed', 'new')) then
    raise exception 'match_confidence 값이 올바르지 않은 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where company_action is not null and company_action not in ('keep', 'fill_if_empty')) then
    raise exception 'company_action 값이 올바르지 않은 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where cas_no is not null and cas_no !~ '^\d{2,7}-\d{2}-\d$') then
    raise exception 'CAS 형식이 올바르지 않은 행이 있습니다.';
  end if;

  -- 6-a) reagent_id / new_reagent_key / match_confidence 조합 검증(Phase 4b-3a.1 §6/§7).
  --      "시약이 어느 쪽인지"가 애매한 payload는 전부 차단 — 서버가 임의로 해석하지 않는다.
  if exists (select 1 from snapshot_rows where reagent_id is null and match_confidence <> 'new') then
    raise exception '시약이 특정되지 않았는데 match_confidence가 new가 아닌 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where reagent_id is null and match_confidence = 'new' and coalesce(new_reagent_key, '') = '') then
    raise exception '신규 시약 행에 new_reagent_key가 없습니다.';
  end if;
  if exists (select 1 from snapshot_rows where reagent_id is not null and new_reagent_key is not null) then
    raise exception '기존 시약(reagent_id)과 신규 시약 그룹(new_reagent_key)이 동시에 지정된 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where reagent_id is not null and not exists (select 1 from reagents rg where rg.id = reagent_id)) then
    raise exception '존재하지 않는 reagent_id를 가리키는 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where reagent_lot_id is not null and not exists (select 1 from reagent_lots l where l.id = reagent_lot_id)) then
    raise exception '존재하지 않는 reagent_lot_id를 가리키는 행이 있습니다.';
  end if;
  if exists (
    select 1 from snapshot_rows r join reagent_lots l on l.id = r.reagent_lot_id
    where r.reagent_lot_id is not null and r.reagent_id is not null and l.reagent_id <> r.reagent_id
  ) then
    raise exception 'Lot과 시약의 관계가 일치하지 않는 행이 있습니다.';
  end if;
  if exists (
    select reagent_lot_id from snapshot_rows where reagent_lot_id is not null
    group by reagent_lot_id having count(*) > 1
  ) then
    raise exception '같은 재고(Lot)를 가리키는 행이 파일 안에 중복됩니다.';
  end if;
  -- 기존 Lot을 가리키면서 동시에 "신규 시약"으로 표시된 행은 절대 있을 수 없다 —
  -- 방치하면 아래 UPDATE 단계에서 기존 Lot이 엉뚱한 새 마스터로 옮겨붙는 사고가 난다.
  if exists (select 1 from snapshot_rows where reagent_lot_id is not null and reagent_id is null) then
    raise exception '기존 재고(Lot)를 가리키면서 시약이 특정되지 않은 행이 있습니다.';
  end if;
  if exists (select 1 from snapshot_rows where reagent_lot_id is not null and match_confidence = 'new') then
    raise exception '기존 재고(Lot)를 가리키는 행이 match_confidence=new로 표시되어 있습니다.';
  end if;

  -- 6-b) 기존 매칭 Lot의 "현재 실제 상태"가 재활성화 가능한 상태인지 확인(Phase 4b-3a.1 §2/§3).
  --      not_in_snapshot → active 재활성화만 허용한다. used_up/disposed/missing은 정상
  --      업무 절차(사용완료 표시 취소, 폐기취소 등)를 거쳐야 하는 확정적 상태라, 이 전체
  --      동기화가 자동으로 되돌리면 안 된다 — 발견 즉시 전체 중단(부분 반영 없음).
  if exists (
    select 1 from snapshot_rows r join reagent_lots l on l.id = r.reagent_lot_id
    where r.reagent_lot_id is not null and l.status not in ('active', 'not_in_snapshot')
  ) then
    select l.status into rec
      from snapshot_rows r join reagent_lots l on l.id = r.reagent_lot_id
      where r.reagent_lot_id is not null and l.status not in ('active', 'not_in_snapshot')
      limit 1;
    raise exception '현재 재고 동기화로 복구할 수 없는 재고 상태입니다: %. 정상 업무 절차로 상태를 먼저 변경한 뒤 새 미리보기를 만들어주세요.', rec.status;
  end if;

  -- 6-c) 같은 reagent_id에 걸린 여러 행끼리 master 관련 요청이 모순되지 않는지 확인
  --      (Phase 4b-3a.1 §5) — 한 시약에 병이 여러 개면 정상이지만, company_action/company
  --      값/expected_reagent_updated_at까지 행마다 달라지면 어느 쪽을 반영할지 알 수 없다.
  if exists (
    select reagent_id
    from snapshot_rows
    where reagent_id is not null
    group by reagent_id
    having count(distinct coalesce(company_action, 'keep')) > 1
        or count(distinct coalesce(expected_reagent_updated_at::text, '')) > 1
  ) then
    raise exception '같은 시약(reagent_id)을 가리키는 행들의 company_action 또는 expected_reagent_updated_at이 서로 다릅니다.';
  end if;
  if exists (
    select reagent_id
    from snapshot_rows
    where reagent_id is not null and company_action = 'fill_if_empty'
    group by reagent_id
    having count(distinct nullif(company, '')) > 1
  ) then
    raise exception '같은 시약(reagent_id)에 대해 서로 다른 제조사(company) 값으로 보완 요청이 들어왔습니다.';
  end if;

  -- 6-d) new_reagent_key 그룹 내 master 값 일관성(Phase 4b-3a.1 §6) — 같은 그룹의 여러
  --      병이 서로 다른 시약을 가리키면(예: 같은 key인데 제조사가 다름) 대표 행을 임의로
  --      골라 마스터를 만들지 않고 즉시 차단한다.
  if exists (
    select new_reagent_key
    from snapshot_rows
    where reagent_id is null and match_confidence = 'new' and new_reagent_key is not null
    group by new_reagent_key
    having count(distinct lower(trim(coalesce(name, '') || '|' || coalesce(name_ko, '') || '|' || coalesce(cas_no, '') || '|'
                                       || coalesce(company, '') || '|' || coalesce(purity, '') || '|'
                                       || coalesce(volume::text, '') || '|' || coalesce(unit, '')))) > 1
  ) then
    raise exception '같은 신규 시약 그룹(new_reagent_key)에 서로 다른 시약 정보가 섞여 있습니다.';
  end if;

  -- 7) baseline active Lot 집합 검증(§7/§8, Phase 4b-3a.1 §10) — 미리보기 이후 다른
  --    사용자가 재고를 바꿨다면(추가/상태변경 등) 오래된 미리보기로 전체를 덮어쓰지 않는다.
  --    NULL/중복이 섞여 들어오면 set 비교 자체가 무의미해지므로 먼저 걸러낸다.
  select array_agg(x) into v_baseline_raw
    from jsonb_array_elements_text(coalesce(payload->'baseline_active_lot_ids', '[]'::jsonb)) x;
  v_baseline_raw := coalesce(v_baseline_raw, array[]::text[]);
  if exists (select 1 from unnest(v_baseline_raw) x where x is null or x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'baseline_active_lot_ids에 올바르지 않은 값이 있습니다.';
  end if;
  if (select count(*) from unnest(v_baseline_raw)) <> (select count(distinct x) from unnest(v_baseline_raw) x) then
    raise exception 'baseline_active_lot_ids에 중복된 값이 있습니다.';
  end if;
  select coalesce(array_agg(x::uuid), array[]::uuid[]) into v_baseline_ids from unnest(v_baseline_raw) x;
  select coalesce(array_agg(id), array[]::uuid[]) into v_current_active_ids
    from reagent_lots where status = 'active';
  if (select array_agg(v order by v) from unnest(v_baseline_ids) v)
     is distinct from
     (select array_agg(v order by v) from unnest(v_current_active_ids) v) then
    raise exception '미리보기 이후 현재 재고가 변경되었습니다. Excel을 다시 확인하여 미리보기를 새로 생성해주세요.' using errcode = 'P0002';
  end if;

  -- 8) optimistic lock 사전 확인(§9) — 실제 UPDATE의 WHERE절에도 동일 조건을 넣어
  --    이 체크와 실행 사이의 경합까지 막는다(아래 단계들의 row_count 검증 참고).
  --    같은 reagent_id 그룹 내 일관성은 6-c에서 이미 확인했으므로 master UPDATE는
  --    reagent당 정확히 1회만 수행된다(반복 검증으로 인한 self-invalidation 없음).
  if exists (
    select 1 from snapshot_rows r join reagents rg on rg.id = r.reagent_id
    where r.reagent_id is not null and r.expected_reagent_updated_at is not null
      and rg.updated_at is distinct from r.expected_reagent_updated_at
  ) then
    raise exception '미리보기 이후 시약 정보가 변경되었습니다. 미리보기를 새로 생성해주세요.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from snapshot_rows r join reagent_lots l on l.id = r.reagent_lot_id
    where r.reagent_lot_id is not null and r.expected_lot_updated_at is not null
      and l.updated_at is distinct from r.expected_lot_updated_at
  ) then
    raise exception '미리보기 이후 재고 정보가 변경되었습니다. 미리보기를 새로 생성해주세요.' using errcode = 'P0002';
  end if;

  -- 9) 신규 시약 마스터 — new_reagent_key 그룹당 정확히 1번만 INSERT(§13/§28, 6-d에서
  --    그룹 내 값 일관성을 이미 확인했으므로 대표 행 선택이 임의성을 갖지 않는다).
  --    한 Excel에 같은 신규 시약이 여러 병(행)으로 있어도 마스터는 하나만 생긴다.
  create temporary table snapshot_new_reagents (
    new_reagent_key text primary key,
    reagent_id uuid not null
  ) on commit drop;

  for rec in
    select distinct on (new_reagent_key) new_reagent_key, name, name_ko, cas_no, company, purity, volume, unit
    from snapshot_rows
    where reagent_id is null and match_confidence = 'new' and new_reagent_key is not null
    order by new_reagent_key, row_no
  loop
    insert into reagents (
      name, name_ko, cas_no, company, purity, volume, unit, reagent_type, status,
      data_source, cas_source, company_source, volume_source
    ) values (
      coalesce(nullif(rec.name, ''), rec.name_ko), nullif(rec.name_ko, ''), nullif(rec.cas_no, ''),
      nullif(rec.company, ''), nullif(rec.purity, ''), rec.volume, nullif(rec.unit, ''),
      'purchased', 'active', 'snapshot_sync',
      case when nullif(rec.cas_no, '') is not null then 'snapshot_sync' else 'manual' end,
      case when nullif(rec.company, '') is not null then 'snapshot_sync' else 'manual' end,
      case when rec.volume is not null then 'snapshot_sync' else 'manual' end
    ) returning id into v_new_id;

    insert into snapshot_new_reagents (new_reagent_key, reagent_id) values (rec.new_reagent_key, v_new_id);
    v_new_reagent_count := v_new_reagent_count + 1;
  end loop;

  update snapshot_rows r
  set reagent_id = m.reagent_id
  from snapshot_new_reagents m
  where r.reagent_id is null and r.new_reagent_key = m.new_reagent_key;

  if exists (select 1 from snapshot_rows where reagent_id is null) then
    -- 방어적 재검증(§6에서 이미 걸렀어야 하나, new_reagent_key 오탈자 등 만약을 대비)
    raise exception '시약을 특정할 수 없는 행이 있습니다(reagent_id/new_reagent_key 확인 필요).';
  end if;

  -- 10) 기존 reagent의 company "비어있을 때만 채우기"(§1-9/§11, Phase 4b-3a.1 §4) —
  --     fail-closed: preview가 승인한 전제(값 있음 + DB가 비어있음)가 실행 시점에 더는
  --     성립하지 않으면 조용히 건너뛰지 않고 즉시 전체 중단한다. company_action이
  --     'fill_if_empty'인데 DB에 이미 값이 있거나 payload company가 비어있으면 예외.
  if exists (
    select 1 from snapshot_rows r join reagents rg on rg.id = r.reagent_id
    where r.company_action = 'fill_if_empty' and nullif(r.company, '') is null
  ) then
    raise exception 'company_action=fill_if_empty인데 채울 제조사 값이 없는 행이 있습니다.';
  end if;
  if exists (
    select 1 from snapshot_rows r join reagents rg on rg.id = r.reagent_id
    where r.company_action = 'fill_if_empty' and rg.company is not null and rg.company <> ''
  ) then
    raise exception '미리보기 이후 시약의 제조사 정보가 이미 채워졌습니다(다른 곳에서 먼저 입력됨). 미리보기를 새로 생성해주세요.' using errcode = 'P0002';
  end if;

  -- WHERE절에도 "여전히 비어있을 때만"을 다시 넣어 위 사전확인과 이 UPDATE 사이의 경합까지
  -- 막는다(다른 화면에서 그 사이 company를 직접 채웠을 가능성) — affected 건수가 기대와
  -- 다르면 그 경합이 실제로 있었다는 뜻이므로 fail-closed로 전체 중단한다.
  with target as (
    select distinct on (reagent_id) reagent_id, nullif(company, '') as company
    from snapshot_rows
    where company_action = 'fill_if_empty' and reagent_id is not null
    order by reagent_id, row_no
  )
  update reagents rg
  set company = t.company, company_source = 'snapshot_sync'
  from target t
  where rg.id = t.reagent_id
    and (rg.company is null or rg.company = '');

  get diagnostics v_actual_match_count = row_count;
  select count(distinct reagent_id) into v_expected_match_count
    from snapshot_rows where company_action = 'fill_if_empty' and reagent_id is not null;
  if v_actual_match_count <> v_expected_match_count then
    raise exception '미리보기 이후 시약의 제조사 정보가 동시에 채워졌습니다. 미리보기를 새로 생성해주세요.' using errcode = 'P0002';
  end if;

  -- 11) 기존 매칭 Lot UPDATE(§16, Phase 4b-3a.1 §2) — DELETE+INSERT 금지, id 보존.
  --     6-b에서 이미 "현재 상태가 active 또는 not_in_snapshot"임을 확인했으므로 여기서
  --     status='active'로 통일 지정하는 것이 안전하다 — used_up/disposed/missing을 되돌릴
  --     일은 절대 없다. lot_no는 identity 성격이라 여기서 변경하지 않는다.
  create temporary table snapshot_matched_lots on commit drop as
  select r.row_no, r.reagent_lot_id, l.status as prev_status
  from snapshot_rows r join reagent_lots l on l.id = r.reagent_lot_id
  where r.reagent_lot_id is not null;

  update reagent_lots l
  set
    location_id = r.location_id,
    current_stock = r.current_stock,
    sealed_count = r.sealed_count,
    shelf_position = coalesce(nullif(r.shelf_position, ''), l.shelf_position),
    cat_no = coalesce(nullif(r.cat_no, ''), l.cat_no),
    received_date = coalesce(r.received_date, l.received_date),
    expiry_date = coalesce(r.expiry_date, l.expiry_date),
    status = 'active',
    needs_review = false
  from snapshot_rows r
  where l.id = r.reagent_lot_id
    and (r.expected_lot_updated_at is null or l.updated_at = r.expected_lot_updated_at);

  get diagnostics v_actual_match_count = row_count;
  select count(*) into v_expected_match_count from snapshot_matched_lots;
  if v_actual_match_count <> v_expected_match_count then
    raise exception '미리보기 이후 재고 정보가 동시에 변경되었습니다. 미리보기를 새로 생성해주세요.' using errcode = 'P0002';
  end if;

  -- reactivated_lot_count는 오직 not_in_snapshot → active 건만, updated_lot_count는
  -- active → active 건만(Phase 4b-3a.1 §3) — 서로 절대 섞이지 않는다. used_up/disposed/
  -- missing은 6-b에서 이미 걸러졌으므로 prev_status가 그 값일 수 없다.
  select count(*) filter (where prev_status = 'active'), count(*) filter (where prev_status = 'not_in_snapshot')
  into v_updated_lot_count, v_reactivated_lot_count
  from snapshot_matched_lots;

  -- 12) 신규 Lot INSERT(§14) — 제조사 Lot No. 있으면 그대로, 없으면 내부 관리번호를
  --     이 트랜잭션(전역 advisory lock 보유 중) 안에서 순차 채번(§15). 프론트에서
  --     생성한 번호는 절대 신뢰하지 않는다(애초에 payload에 포함하지도 않는다).
  --     정규식을 "KNU-YYYYMMDD-" 접두어 전체까지 고정해(Phase 4b-3a.1 §15), 우연히
  --     "-123"으로 끝나는 제조사 Lot No.를 내부번호로 오인해 채번에 섞이지 않게 한다.
  --     주의: BulkAddTab 등 다른 생성 경로는 이 advisory lock을 잡지 않으므로, 정확히
  --     같은 시각에 그쪽에서도 내부번호를 채번 중이면 이론상 번호가 겹칠 수 있다
  --     (lot_no에는 unique 제약이 없어 오류가 나지는 않고 표시상 라벨만 중복됨 — 완료
  --     보고의 "내부관리번호 생성 경쟁 경로" 참고, 이번 Phase에서 다른 경로는 수정 안 함).
  v_prefix := 'KNU-' || to_char(current_date, 'YYYYMMDD') || '-';
  select coalesce(max(substring(lot_no from '^KNU-[0-9]{8}-([0-9]+)$')::int), 0) into v_seq
    from reagent_lots where lot_no ~ ('^' || v_prefix || '[0-9]+$');

  for rec in
    select row_no, reagent_id, location_id, shelf_position, received_date, expiry_date,
           cat_no, current_stock, sealed_count, nullif(lot_no, '') as lot_no_in
    from snapshot_rows
    where reagent_lot_id is null
    order by row_no
  loop
    if rec.lot_no_in is not null then
      insert into reagent_lots (
        reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock,
        location_id, shelf_position, received_date, expiry_date, status
      ) values (
        rec.reagent_id, rec.lot_no_in, 'manufacturer', nullif(rec.cat_no, ''),
        rec.sealed_count, rec.current_stock, rec.location_id, nullif(rec.shelf_position, ''),
        rec.received_date, rec.expiry_date, 'active'
      );
    else
      v_seq := v_seq + 1;
      insert into reagent_lots (
        reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock,
        location_id, shelf_position, received_date, expiry_date, status
      ) values (
        rec.reagent_id, v_prefix || lpad(v_seq::text, 3, '0'), 'generated:unmarked', nullif(rec.cat_no, ''),
        rec.sealed_count, rec.current_stock, rec.location_id, nullif(rec.shelf_position, ''),
        rec.received_date, rec.expiry_date, 'active'
      );
    end if;
    v_new_lot_count := v_new_lot_count + 1;
  end loop;

  -- 13) snapshot에 없는 기존 active Lot → not_in_snapshot(§17/§20, Phase 4b-3a.1 §9).
  --     NOT EXISTS + 명시적 IS NOT NULL 필터로 NULL 3치 논리 함정을 피한다 — reagent_lot_id가
  --     NULL인 신규 Lot 행이 섞여 있어도(실제로 매 실행마다 섞여 있음) 이 UPDATE의 대상
  --     판정에는 전혀 영향을 주지 않는다. used_up/disposed/missing은 status='active' 조건에
  --     안 걸려 대상이 아니다. DELETE 없음, disposal_date 등 다른 필드도 건드리지 않는다.
  create temporary table snapshot_excluded_lots on commit drop as
  with updated as (
    update reagent_lots l
    set status = 'not_in_snapshot'
    where l.status = 'active'
      and not exists (
        select 1 from snapshot_rows r where r.reagent_lot_id is not null and r.reagent_lot_id = l.id
      )
    returning l.id, l.reagent_id
  )
  select * from updated;
  select count(*) into v_not_in_snapshot_count from snapshot_excluded_lots;

  -- 14) 영향받은 reagent의 active/archived 재계산(§19, Phase 4b-3a.1 §23/§24) — master
  --     row는 절대 DELETE하지 않고 status만 전환. 대상은 이번에 매칭/신규/제외된 모든
  --     reagent(기존 matched + NEW + not_in_snapshot으로 빠진 Lot의 reagent + 재활성화된
  --     Lot의 reagent 전부 snapshot_rows/snapshot_excluded_lots 두 집합의 합집합에 포함됨).
  --     실제로 값이 바뀐 것만 카운트(원래도 active였던 건 제외) — 신규 reagent는 INSERT
  --     시점에 이미 status='active'라 여기서 "재활성화"로 잘못 세지 않는다.
  create temporary table snapshot_touched_reagents on commit drop as
  select reagent_id from snapshot_rows
  union
  select reagent_id from snapshot_excluded_lots;

  with counts as (
    select tr.reagent_id, count(l.id) filter (where l.status = 'active') as active_count
    from snapshot_touched_reagents tr
    left join reagent_lots l on l.reagent_id = tr.reagent_id
    group by tr.reagent_id
  ),
  changed as (
    update reagents rg
    set status = case when c.active_count > 0 then 'active' else 'archived' end
    from counts c
    where rg.id = c.reagent_id
      and rg.status <> case when c.active_count > 0 then 'active' else 'archived' end
    returning rg.status
  )
  select count(*) filter (where status = 'archived'), count(*) filter (where status = 'active')
  into v_archived_reagent_count, v_reactivated_reagent_count
  from changed;

  -- 15) 감사 로그 — 같은 트랜잭션 안이라 이 INSERT가 실패하면(예: 제약 위반) 위의 모든
  --     reagent/lot 변경도 함께 rollback된다(Phase 4b-3a.1 §27) — "감사기록 없이 재고만
  --     바뀐 상태"는 애초에 만들어질 수 없다. EXCEPTION 블록으로 오류를 삼키지 않는다.
  insert into inventory_snapshot_syncs (
    snapshot_id, executed_by, source_filename, source_row_count,
    updated_lot_count, new_lot_count, not_in_snapshot_lot_count, reactivated_lot_count,
    new_reagent_count, archived_reagent_count, reactivated_reagent_count, warning_count, summary
  ) values (
    v_snapshot_id, auth.uid(), v_source_filename, v_row_count,
    v_updated_lot_count, v_new_lot_count, v_not_in_snapshot_count, v_reactivated_lot_count,
    v_new_reagent_count, v_archived_reagent_count, v_reactivated_reagent_count, v_preview_warning_count,
    jsonb_build_object(
      'updated_lots', v_updated_lot_count, 'new_lots', v_new_lot_count,
      'not_in_snapshot_lots', v_not_in_snapshot_count, 'reactivated_lots', v_reactivated_lot_count,
      'new_reagents', v_new_reagent_count, 'archived_reagents', v_archived_reagent_count,
      'reactivated_reagents', v_reactivated_reagent_count,
      'preview_warning_count', v_preview_warning_count
    )
  );

  -- 16) admin_logs에도 한 줄 요약(기존 관리자 작업기록 화면과 통합 노출을 위함).
  --     구조화된 상세는 위 inventory_snapshot_syncs에 이미 저장했다.
  insert into admin_logs (admin_name, action, target_type, description)
  values (
    coalesce(auth.jwt() ->> 'email', '자료관리 관리자'),
    '현재 재고 동기화', 'inventory',
    format('기존 Lot %s건 갱신(재활성 %s건 포함), 신규 Lot %s건, 현재 목록 제외 %s건, 신규 시약 %s종, 보관 처리 %s종',
      v_updated_lot_count, v_reactivated_lot_count, v_new_lot_count, v_not_in_snapshot_count,
      v_new_reagent_count, v_archived_reagent_count)
  );

  -- 17) 결과 반환
  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'updated_lots', v_updated_lot_count,
    'new_lots', v_new_lot_count,
    'not_in_snapshot_lots', v_not_in_snapshot_count,
    'reactivated_lots', v_reactivated_lot_count,
    'new_reagents', v_new_reagent_count,
    'archived_reagents', v_archived_reagent_count,
    'reactivated_reagents', v_reactivated_reagent_count
  );
end;
$$;

comment on function public.sync_inventory_snapshot(jsonb) is
  '현재 재고 Excel 동기화 — 단일 트랜잭션. is_admin() 필요, 전역 advisory lock으로 동시 실행 방지,
   baseline/updated_at optimistic lock으로 stale preview 적용 차단. not_in_snapshot 재활성화만 허용
   (used_up/disposed/missing은 차단). company는 fill_if_empty만 fail-closed로 허용. reagent/lot는
   UPDATE만(id 보존), 신규만 INSERT. Phase 4b-3a에서 작성, Phase 4b-3a.1에서 보강, 운영 미적용.';

-- Supabase는 public 스키마 함수 생성 시 postgres role의 ALTER DEFAULT PRIVILEGES로
-- anon/authenticated/service_role에 EXECUTE를 자동 부여한다 — "revoke all ... from public"은
-- PUBLIC 의사역할 권한만 지우고 이 role별 default grant는 안 지워서, anon에 EXECUTE가 그대로
-- 남는 문제가 있었다(Phase 4b-3b-S1 발견). anon은 명시적으로 다시 revoke한다.
revoke all on function public.sync_inventory_snapshot(jsonb) from public;
revoke execute on function public.sync_inventory_snapshot(jsonb) from anon;
grant execute on function public.sync_inventory_snapshot(jsonb) to authenticated;
-- anon에는 이제 execute 권한 자체가 없다(위 explicit revoke). authenticated에게 열어도
-- 함수 최상단 is_admin() 검사가 최종 인가 — 일반 로그인 사용자(비관리자)가 authenticated
-- 세션을 가졌다 해도(현재 앱은 Supabase Auth 로그인을 안 쓰므로 사실상 해당 없음) 거부된다.
