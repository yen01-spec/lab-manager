-- READ ONLY: 병 단위 모델/요청 테이블/FK 구조 확인 (staging 전용)
select jsonb_build_object(
  'columns', (select jsonb_object_agg(table_name, cols) from (
      select table_name, jsonb_agg(column_name || ':' || data_type || case when is_nullable='NO' then ' NN' else '' end order by ordinal_position) cols
      from information_schema.columns
      where table_schema='public' and table_name in ('reagents','reagent_lots','locations','location_requests','disposal_requests','reagent_change_requests','location_history','stock_logs','admin_logs')
      group by table_name) t),
  'fks', (select jsonb_agg(c.conrelid::regclass::text || ' -> ' || c.confrelid::regclass::text || ' (' || pg_get_constraintdef(c.oid) || ')')
      from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace),
  'unique_idx', (select jsonb_agg(indexdef) from pg_indexes where schemaname='public' and tablename in ('reagent_lots','location_requests','disposal_requests','reagent_change_requests','location_history') and indexdef ilike '%unique%'),
  'checks', (select jsonb_agg(conrelid::regclass::text || ': ' || pg_get_constraintdef(oid)) from pg_constraint where contype='c' and conrelid::regclass::text in ('reagent_lots','location_requests','disposal_requests','reagent_change_requests','reagents')),
  'lot_counts', (select jsonb_build_object('rows', count(*), 'distinct_reagent_lotno', count(distinct (reagent_id, lot_no)), 'null_lotno', count(*) filter (where lot_no is null)) from public.reagent_lots),
  'dup_lotno_groups', (select count(*) from (select 1 from public.reagent_lots group by reagent_id, lot_no having count(*)>1) x),
  'status_dist', (select jsonb_object_agg(coalesce(status,'null'), n) from (select status, count(*) n from public.reagent_lots group by 1) s),
  'tables', (select jsonb_agg(table_name order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE')
);
