-- 시약 원부 엑셀에 있던 "등록자" 컬럼을 우리 시스템엔 반영하지 못하고
-- 있었음(누가 이 시약 레코드를 등록했는지 추적 불가). 관리자 수동 등록
-- (Admin.jsx addReagent)과 학생 직접제조 등록(ReagentList.jsx submitMade)
-- 시점에 로그인 세션의 student_id를 저장해서 상세페이지에서 확인 가능하게 함.
-- 기존 1988개 엑셀 일괄 등록분은 등록자 정보 자체가 없으므로 null로 둔다.
alter table reagents
  add column if not exists registered_by text references students(student_id);

comment on column reagents.registered_by is '등록자 (students.student_id 참조). 엑셀 일괄 등록분은 null.';
