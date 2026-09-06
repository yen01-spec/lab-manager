-- app_settings는 RLS가 켜져 있어(admin_password 등 민감정보라 의도적으로 anon 쓰기 차단)
-- anon 키로는 못 넣고 마이그레이션(관리자 연결)으로 넣어야 함. ON CONFLICT는 key 컬럼의
-- 유일성 제약을 확신할 수 없어 WHERE NOT EXISTS로 안전하게 처리.
insert into app_settings (key, value)
  select 'lab_name', ''
  where not exists (select 1 from app_settings where key = 'lab_name');
