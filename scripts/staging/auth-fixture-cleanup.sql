-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
drop function if exists public.admin_password_change(text, text);
drop function if exists public.student_admin_upgrade(text, text);
drop function if exists public.student_session_refresh(text);
drop function if exists public.student_register(text, text, date);
drop function if exists public.student_admin_login(text, text, date, text);
drop function if exists public.student_check_login(text, text, date);
drop table if exists app_settings;
drop table if exists students;
