-- 새로 만든 테이블들이 기본적으로 RLS가 켜진 채 생성되어(정책 없음) anon
-- 키로 insert/select가 전부 막혀있었음(테스트 중 "new row violates
-- row-level security policy for table students" 발견).
-- 기존 앱의 다른 테이블들(reagents 등)은 anon 키로 바로 읽고 쓰는 걸
-- 전제로 동작하므로, 같은 보안 모델(앱단 권한 체크만, DB는 개방)을
-- 맞춰서 RLS를 끈다.
alter table students disable row level security;
alter table purchase_request_logs disable row level security;
alter table purchase_request_reagent_items disable row level security;
alter table purchase_request_goods_items disable row level security;
