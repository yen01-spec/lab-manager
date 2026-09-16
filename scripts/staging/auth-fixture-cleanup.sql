-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
drop function if exists public.disposal_request_submit(text, uuid, uuid, text, text, text, text);
drop table if exists disposal_requests;
drop function if exists public.student_logout(text);
drop function if exists public.student_session_refresh(text);
drop function if exists public._resolve_student_session(text);
drop function if exists public._issue_student_session(text);
drop table if exists student_sessions;
drop function if exists public.admin_password_change(text, text);
drop function if exists public.student_admin_upgrade(text, text);
drop function if exists public.student_register(text, text, date);
drop function if exists public.student_admin_login(text, text, date, text);
drop function if exists public.student_check_login(text, text, date);
drop table if exists app_settings;
drop table if exists students;
