-- STAGING TEST ONLY (read-only)
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by relname;
