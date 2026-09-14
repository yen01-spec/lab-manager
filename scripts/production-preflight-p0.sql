-- READ ONLY. Production Gate P0 preflight — schema compatibility check for
-- supabase/migrations/20260914090000_inventory_snapshot_sync.sql against the REAL
-- production schema. No writes of any kind. Safe to run against production.
select jsonb_build_object(

  'reagents_columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'reagents'
      and column_name in ('id','name','name_ko','cas_no','company','purity','volume','unit',
                           'reagent_type','status','data_source','cas_source','company_source','volume_source','updated_at')
  ),
  'reagents_missing_columns', (
    select jsonb_agg(want)
    from unnest(array['id','name','name_ko','cas_no','company','purity','volume','unit',
                       'reagent_type','status','data_source','cas_source','company_source','volume_source','updated_at']) want
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reagents' and column_name = want
    )
  ),
  'reagents_type_check', (
    select pg_get_constraintdef(oid) from pg_constraint where conname = 'reagents_reagent_type_check' and conrelid = 'public.reagents'::regclass
  ),
  'reagents_status_check', (
    select pg_get_constraintdef(oid) from pg_constraint where conname = 'reagents_status_check' and conrelid = 'public.reagents'::regclass
  ),
  'reagents_updated_at_trigger', (
    select jsonb_agg(jsonb_build_object('trigger', trigger_name, 'timing', action_timing, 'event', event_manipulation))
    from information_schema.triggers
    where trigger_schema = 'public' and event_object_table = 'reagents'
  ),

  'reagent_lots_columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'reagent_lots'
      and column_name in ('id','reagent_id','lot_no','lot_source','cat_no','sealed_count','current_stock',
                           'location_id','shelf_position','received_date','expiry_date','status','needs_review','updated_at')
  ),
  'reagent_lots_missing_columns', (
    select jsonb_agg(want)
    from unnest(array['id','reagent_id','lot_no','lot_source','cat_no','sealed_count','current_stock',
                       'location_id','shelf_position','received_date','expiry_date','status','needs_review','updated_at']) want
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reagent_lots' and column_name = want
    )
  ),
  'reagent_lots_status_check', (
    select pg_get_constraintdef(oid) from pg_constraint where conname = 'reagent_lots_status_check' and conrelid = 'public.reagent_lots'::regclass
  ),
  'reagent_lots_fk', (
    select jsonb_agg(jsonb_build_object('constraint', conname, 'def', pg_get_constraintdef(oid)))
    from pg_constraint
    where conrelid = 'public.reagent_lots'::regclass and contype = 'f'
  ),
  'reagent_lots_updated_at_trigger', (
    select jsonb_agg(jsonb_build_object('trigger', trigger_name, 'timing', action_timing, 'event', event_manipulation))
    from information_schema.triggers
    where trigger_schema = 'public' and event_object_table = 'reagent_lots'
  ),

  'locations_exists', (select exists(select 1 from information_schema.tables where table_schema='public' and table_name='locations')),
  'locations_id_column', (
    select jsonb_build_object('type', data_type, 'nullable', is_nullable)
    from information_schema.columns where table_schema='public' and table_name='locations' and column_name='id'
  ),

  'admin_users_exists', (select exists(select 1 from information_schema.tables where table_schema='public' and table_name='admin_users')),
  'admin_users_columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type) order by ordinal_position)
    from information_schema.columns where table_schema='public' and table_name='admin_users'
  ),

  'admin_logs_exists', (select exists(select 1 from information_schema.tables where table_schema='public' and table_name='admin_logs')),
  'admin_logs_columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable) order by ordinal_position)
    from information_schema.columns where table_schema='public' and table_name='admin_logs'
  ),
  'admin_logs_required_present', (
    select jsonb_agg(want)
    from unnest(array['admin_name','action','target_type','description']) want
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'admin_logs' and column_name = want
    )
  ),

  'is_admin_exists', (
    select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_admin')
  ),
  'is_admin_security_definer', (
    select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_admin'
  ),

  'update_updated_at_exists', (
    select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_updated_at')
  ),
  'update_updated_at_def', (
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_updated_at'
  ),

  'inventory_snapshot_syncs_exists', (select exists(select 1 from information_schema.tables where table_schema='public' and table_name='inventory_snapshot_syncs')),
  'sync_inventory_snapshot_exists', (
    select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_inventory_snapshot')
  )

) as result;
