-- students.is_admin만으로는 기존 admin_password/super_password 구분을 유지할 수 없어 추가.
alter table students
  add column if not exists is_super boolean not null default false;
