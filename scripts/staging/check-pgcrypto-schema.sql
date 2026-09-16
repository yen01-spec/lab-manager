-- STAGING TEST ONLY (read-only)
select n.nspname as schema, p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('crypt', 'gen_salt');
