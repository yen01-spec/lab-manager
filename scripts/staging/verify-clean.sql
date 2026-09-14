-- STAGING TEST ONLY (read-only verification query)
select jsonb_build_object(
  'remaining_tables', (
    select jsonb_agg(table_name)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('locations','reagents','reagent_lots','admin_users','admin_logs','inventory_snapshot_syncs')
  ),
  'remaining_functions', (
    select jsonb_agg(p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_admin','update_updated_at','sync_inventory_snapshot')
  )
) as result;
