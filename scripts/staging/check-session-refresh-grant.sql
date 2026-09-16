-- STAGING TEST ONLY (read-only)
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public' and routine_name='student_session_refresh';

select p.proname, p.proacl::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='student_session_refresh';
