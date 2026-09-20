-- READ ONLY (집계만): 백업/복원 대상 범위 분석 — 테이블별 행 수, FK, 소프트 참조 고아 행, 컬럼 타입(복원 시 주의)
select jsonb_build_object(
  'row_counts', (select jsonb_object_agg(table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int)
                   from information_schema.tables where table_schema='public' and table_type='BASE TABLE'),
  'fks', (select jsonb_agg(c.conrelid::regclass::text || ' -> ' || c.confrelid::regclass::text || ' [' || pg_get_constraintdef(c.oid) || ']')
            from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace),
  'orphans', jsonb_build_object(
    'location_history.lot_id', (select count(*) from location_history h where h.lot_id is not null and not exists (select 1 from reagent_lots l where l.id=h.lot_id)),
    'location_history.reagent_id', (select count(*) from location_history h where h.reagent_id is not null and not exists (select 1 from reagents r where r.id=h.reagent_id)),
    'location_requests.lot_id', (select count(*) from location_requests h where h.lot_id is not null and not exists (select 1 from reagent_lots l where l.id=h.lot_id)),
    'disposal_requests.lot_id', (select count(*) from disposal_requests h where h.lot_id is not null and not exists (select 1 from reagent_lots l where l.id=h.lot_id)),
    'reagent_change_requests.reagent_id', (select count(*) from reagent_change_requests h where h.reagent_id is not null and not exists (select 1 from reagents r where r.id=h.reagent_id)),
    'stock_logs.lot_id', (select count(*) from stock_logs h where h.lot_id is not null and not exists (select 1 from reagent_lots l where l.id=h.lot_id)),
    'reagent_lots.location_id', (select count(*) from reagent_lots h where h.location_id is not null and not exists (select 1 from locations l where l.id=h.location_id)),
    'reagents.location_id', (select count(*) from reagents h where h.location_id is not null and not exists (select 1 from locations l where l.id=h.location_id))),
  'auth_linked', (select jsonb_agg(conrelid::regclass::text) from pg_constraint where contype='f' and confrelid='auth.users'::regclass),
  'reagent_import_history_cols', (select jsonb_agg(column_name||':'||data_type) from information_schema.columns where table_schema='public' and table_name='reagent_import_history'),
  'stock_history_cols', (select jsonb_agg(column_name||':'||data_type) from information_schema.columns where table_schema='public' and table_name='stock_history'),
  'triggers', (select jsonb_agg(event_object_table||':'||trigger_name) from information_schema.triggers where trigger_schema='public'),
  'generated_or_identity_cols', (select jsonb_agg(table_name||'.'||column_name||':'||coalesce(is_identity,'')||coalesce(generation_expression,'')) from information_schema.columns where table_schema='public' and (is_identity='YES' or is_generated='ALWAYS')),
  'sequences', (select jsonb_agg(sequencename) from pg_sequences where schemaname='public')
);
