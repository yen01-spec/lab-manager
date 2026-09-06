-- 2026-2 전수조사 데이터 재업로드 준비 (2).
-- 1) reagent_lots.registered_by(FK: students.student_id)는 실제 앱 등록(로그인 후 등록) 흐름
--    전용으로 남겨두고, 이번 엑셀 일괄 임포트처럼 학번 계정 없이 실명만 있는 경우를 위한
--    자유 텍스트 컬럼을 별도로 둠 — reagents.registered_by 컬럼의 주석("엑셀 일괄 등록분은
--    null")과 같은 원칙: FK 컬럼은 null로 두고 이름은 텍스트로만 기록.
-- 2) '조치필요' 탭(실물 확인이 아직 안 된 24건)을 해당 Lot에 표시하기 위한 플래그+메모.
alter table reagent_lots
  add column if not exists registered_by_name text,
  add column if not exists needs_action boolean not null default false,
  add column if not exists action_note text;

comment on column reagent_lots.registered_by_name is '전수조사 엑셀의 "등록자"(실명, 학번 계정 아님) — reagent_lots.registered_by(FK)는 이 경우 null로 남김.';
comment on column reagent_lots.needs_action is '2026-2 전수조사 "조치필요" 탭에 남아있는 미해결 확인사항이 있는 Lot인지(라벨/CAS/보관위치/안전 등 실물 확인 필요).';
comment on column reagent_lots.action_note is 'needs_action=true일 때의 확인·조치 내용(전수조사 "조치필요" 탭 원문).';
