-- 위치 이동을 시약 마스터가 아니라 Lot(병) 단위로 정확히 기록하기 위해
-- lot_id 추가. disposal_requests.lot_id와 동일한 패턴.
--
-- 마스터/Lot 구조 분리 이후, 시약 하나에 Lot이 여러 개면 "어느 병을
-- 옮겼는지"를 구분해야 하는데 지금까지는 reagent_id만 있어서 불가능했다.
alter table location_history
  add column if not exists lot_id uuid references reagent_lots(id);
alter table location_requests
  add column if not exists lot_id uuid references reagent_lots(id);
