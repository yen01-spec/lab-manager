-- READ ONLY. Production Gate P0 — current row counts + inventory integrity baseline.
-- No writes of any kind.
select jsonb_build_object(

  'reagents_total', (select count(*) from reagents),
  'reagents_active', (select count(*) from reagents where status = 'active'),
  'reagents_archived', (select count(*) from reagents where status = 'archived'),
  'reagents_other_status', (
    select jsonb_agg(distinct status) from reagents where status not in ('active','archived')
  ),

  'reagent_lots_total', (select count(*) from reagent_lots),
  'reagent_lots_by_status', (
    select jsonb_object_agg(status, cnt) from (
      select status, count(*) as cnt from reagent_lots group by status
    ) x
  ),

  'locations_total', (select count(*) from locations),

  'inventory_snapshot_syncs_exists', (select exists(select 1 from information_schema.tables where table_schema='public' and table_name='inventory_snapshot_syncs')),
  'sync_inventory_snapshot_exists', (select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_inventory_snapshot')),

  -- integrity
  'active_lot_count', (select count(*) from reagent_lots where status = 'active'),
  'active_lot_distinct_id_count', (select count(distinct id) from reagent_lots where status = 'active'),
  'duplicate_lot_ids', (
    select count(*) from (select id from reagent_lots group by id having count(*) > 1) x
  ),
  'lots_with_null_reagent_id', (select count(*) from reagent_lots where reagent_id is null),
  'orphan_lots_reagent_fk', (
    select count(*) from reagent_lots l where not exists (select 1 from reagents r where r.id = l.reagent_id)
  ),
  'orphan_lots_location_fk', (
    select count(*) from reagent_lots l where l.location_id is not null and not exists (select 1 from locations loc where loc.id = l.location_id)
  ),
  'lots_with_null_location_id', (select count(*) from reagent_lots where location_id is null),
  'malformed_uuid_lot_ids', (
    select count(*) from reagent_lots where id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )

) as result;
