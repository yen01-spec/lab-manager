-- READ ONLY. Master Finish Phase 2/10 준비 — 재고실사/Lot 번호 관련 제약·인덱스·중복 확인 (SELECT만).
select jsonb_build_object(
  'checks', (select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'def', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname)
             from pg_constraint where contype in ('c', 'u') and connamespace = 'public'::regnamespace
               and conrelid::regclass::text in ('inventory_sessions','inventory_counts','inventory_assignments','reagent_lots','reagents','purchase_request_logs','stock_logs','location_history')),
  'indexes', (select jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef) order by tablename, indexname)
              from pg_indexes where schemaname = 'public' and tablename in ('inventory_sessions','inventory_counts','reagent_lots','reagents','stock_logs')),
  'nullability', (select jsonb_agg(jsonb_build_object('table', table_name, 'col', column_name, 'nullable', is_nullable, 'type', data_type, 'default', column_default) order by table_name, ordinal_position)
                  from information_schema.columns where table_schema = 'public' and table_name in ('inventory_sessions','inventory_counts','purchase_request_logs','purchase_request_reagent_items','purchase_request_goods_items')),
  'generated_lot_dupes', (select coalesce(jsonb_agg(jsonb_build_object('lot_no', lot_no, 'n', n)), '[]'::jsonb) from (select lot_no, count(*) n from reagent_lots where lot_no ~ '^KNU-[0-9]{8}-[0-9]+$' group by lot_no having count(*) > 1) d),
  'generated_lot_count', (select count(*) from reagent_lots where lot_no ~ '^KNU-[0-9]{8}-[0-9]+$'),
  'lot_source_values', (select jsonb_agg(jsonb_build_object('src', lot_source, 'n', n)) from (select lot_source, count(*) n from reagent_lots group by lot_source) s),
  'session_status_values', (select jsonb_agg(jsonb_build_object('status', status, 'n', n)) from (select status, count(*) n from inventory_sessions group by status) s),
  'session_rows', (select jsonb_agg(jsonb_build_object('id', id, 'year', year, 'status', status, 'purpose', purpose, 'label', label)) from inventory_sessions),
  'assign_status', (select jsonb_agg(jsonb_build_object('status', status, 'n', n)) from (select status, count(*) n from inventory_assignments group by status) s)
) as result;
