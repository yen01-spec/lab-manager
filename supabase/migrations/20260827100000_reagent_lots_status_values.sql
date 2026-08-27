-- Lot 상태를 2단계(active/disposed)에서 4단계로 세분화.
--
-- 사용자 피드백: "사용완료"(정상 소진), "폐기"(남은 시약 처분), "분실/미확인"
-- (실사에서 못 찾음)은 의미가 서로 달라서 변경이력에도 각각 구분해서
-- 남겨야 한다. 방금 추가한 status 컬럼이 아직 앱 코드에서 전혀 쓰이고
-- 있지 않아 데이터 이관 없이 안전하게 값 범위만 넓힌다.
alter table reagent_lots drop constraint if exists reagent_lots_status_check;
alter table reagent_lots add constraint reagent_lots_status_check
  check (status in ('active', 'used_up', 'disposed', 'missing'));

comment on column reagent_lots.status is
  '''active''(보유중) | ''used_up''(정상 사용완료) | ''disposed''(폐기 처리) | ''missing''(실사에서 미확인/분실). 삭제 대신 상태만 바꿔 이력을 보존한다.';
