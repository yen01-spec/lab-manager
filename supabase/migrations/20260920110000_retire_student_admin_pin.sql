-- ════════════════════════════════════════════════════════════════════════
-- Master Finish Phase 5 — 학생 "관리자 승격(PIN)" 체계 폐기.
--
-- ⚠️ staging에만 적용. production 미적용.
--
-- 관리자 권한의 근거는 오직 Supabase Auth → admin_users → public.is_admin() 이다.
-- 예전 체계(students.is_admin + 공유 PIN으로 자가 승격)는 DB가 강제하지 못하는 UI 플래그였고,
-- 이제 모든 관리자 write 가 is_admin() 으로 통제되므로 더 이상 어떤 권한의 근거도 아니다.
-- 그래서 로그인/승격/PIN 변경 RPC 3개를 제거한다.
--
-- 의도적으로 하지 않는 것(데이터 보존): students.is_admin / password_hash 컬럼과 app_settings 의
-- admin_password 행은 삭제하지 않는다(값 자체가 사용자 데이터/비밀이라 파괴적 변경 판단이 필요 —
-- 관리자 계정 전환 이후 별도 정리 후보). 둘 다 클라이언트가 읽을 수 없고 어떤 코드도 쓰지 않는다.
-- ════════════════════════════════════════════════════════════════════════
drop function if exists public.student_admin_login(text, text, date, text);
drop function if exists public.student_admin_upgrade(text, text);
drop function if exists public.admin_password_change(text, text);
