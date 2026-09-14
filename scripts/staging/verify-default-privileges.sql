-- STAGING TEST ONLY (read-only verification query)
select jsonb_build_object(
  'default_acl_public_schema_functions', (
    select jsonb_agg(jsonb_build_object(
      'defaclrole', (select rolname from pg_roles where oid = d.defaclrole),
      'defaclnamespace', n.nspname,
      'defaclobjtype', d.defaclobjtype,
      'defaclacl', d.defaclacl::text
    ))
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    where d.defaclobjtype = 'f'
  ),
  'function_acl_raw', (
    select proacl::text from pg_proc
    where proname = 'sync_inventory_snapshot'
      and pronamespace = 'public'::regnamespace
  )
) as result;
