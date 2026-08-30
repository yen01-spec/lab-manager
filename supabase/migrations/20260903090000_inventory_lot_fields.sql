-- 재고실사 중 Lot 고유 정보(Cat No./Lot No.)도 시약 기본정보(이름/CAS/회사 등)와
-- 동일하게 스테이징(1단계 반영 + 되돌리기용 book 스냅샷) 방식으로 수정 가능하게 함.

alter table inventory_counts
  add column if not exists staged_lot_fields jsonb, -- 실사 중 입력한 Cat No./Lot No. 스테이징(1단계에서 reagent_lots에 반영)
  add column if not exists book_lot_fields jsonb;    -- 실사 시작 시점의 Cat No./Lot No. 스냅샷(되돌리기용)

comment on column inventory_counts.staged_lot_fields is '실사 중 입력한 Lot 고유정보(cat_no, lot_no) 스테이징';
comment on column inventory_counts.book_lot_fields is '실사 시작 시점의 cat_no, lot_no 스냅샷(되돌리기용)';
