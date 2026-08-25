-- ════════════════════════════════════════════════════════════════
-- v2 redesign — foundation migration
--
-- 이 스키마는 코드베이스(.select/.insert/.update 호출)를 grep해서
-- 역추적한 "최선 추정" 스키마를 기준으로 작성했습니다. 로컬에
-- supabase/migrations 이력이 없어(스키마가 대시보드에서 수기로
-- 만들어짐) 100% 확신할 수 없습니다.
--
-- 원칙: 기존 컬럼/테이블은 절대 변경·삭제하지 않고 전부 "추가"만
-- 합니다. 실행 전 반드시 `supabase db diff` 또는 스테이징 환경에서
-- 먼저 검증하세요.
-- ════════════════════════════════════════════════════════════════

-- ── 1. 사용자 로스터 (학번 로그인) ──────────────────────────────
create table if not exists students (
  student_id     text primary key,
  name           text not null,
  birth_date     date not null,
  is_admin       boolean not null default false,
  password_hash  text,                     -- 관리자만 값 있음 (bcrypt 등, 앱에서 해싱)
  created_at     timestamptz not null default now()
);

comment on table students is '학번+생년월일+이름으로 로그인하는 사용자 로스터. 관리자는 password_hash도 필요.';

-- ── 2. reagents 확장: 최종확인일/확인자, 직접제조시약, 보관(archive) 상태 ──
alter table reagents
  add column if not exists last_confirmed_at   timestamptz,
  add column if not exists confirmed_by        text references students(student_id),
  add column if not exists reagent_type        text not null default 'purchased'
    check (reagent_type in ('purchased', 'self_made')),
  add column if not exists made_date           date,      -- 직접제조시약: 제조일
  add column if not exists made_purpose        text,      -- 직접제조시약: 용도
  add column if not exists status              text not null default 'active'
    check (status in ('active', 'archived'));              -- 폐기 확정/다씀 시 archived로 전환

comment on column reagents.last_confirmed_at is '평소 확인 또는 재고실사에서 마지막으로 확인된 시각. 확인만 해도 갱신, 정보 수정해도 갱신.';
comment on column reagents.confirmed_by is '최종 확인자 (students.student_id 참조).';
comment on column reagents.reagent_type is 'purchased=구매 시약(CAS/Cat No/회사 있음), self_made=직접 제조 시약(없음)';
comment on column reagents.status is 'active=목록/검색에 노출, archived=폐기확정·다씀 처리되어 숨김(레코드는 보존)';

create index if not exists idx_reagents_status on reagents(status);
create index if not exists idx_reagents_type on reagents(reagent_type);

-- ── 3. 재고실사 담당자/확인자를 실명 계정에 연결 (기존 텍스트 컬럼은 유지) ──
alter table inventory_assignments
  add column if not exists assigned_student_id text references students(student_id);

alter table inventory_counts
  add column if not exists counted_by_student_id text references students(student_id);

comment on column inventory_assignments.assigned_student_id is '기존 assigned_to(텍스트 이름) 대신 실제 학번 계정과 연결. 과도기엔 둘 다 채워질 수 있음.';

-- ── 4. 학생 수정요청 / 폐기신청을 실명 계정에 연결 ──────────────
-- (reagent_change_requests, disposal_requests 테이블은 이미 존재하며
--  구조가 우리가 설계한 "대기중 → 승인/반려" 흐름과 그대로 맞음.
--  기존 requested_by/approved_by 텍스트 컬럼은 유지하고, FK 컬럼만 추가.)
alter table reagent_change_requests
  add column if not exists requested_by_student_id text references students(student_id),
  add column if not exists approved_by_student_id  text references students(student_id);

alter table disposal_requests
  add column if not exists requested_by_student_id text references students(student_id),
  add column if not exists approved_by_student_id  text references students(student_id);

-- ── 5. 구매요청서 (신규 · 상태추적 없음 · 기존 purchase_requests와 별개) ──
-- 기존 purchase_requests 테이블은 승인/발주/배송 워크플로가 있는
-- "구버전" 구조라서 그대로 재사용하지 않고, 상태값 없는 가벼운
-- 기록용 테이블을 새로 만듭니다.
create table if not exists purchase_request_logs (
  id            uuid primary key default gen_random_uuid(),
  requested_by  text references students(student_id),
  note          text,
  created_at    timestamptz not null default now()
);

create table if not exists purchase_request_reagent_items (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references purchase_request_logs(id) on delete cascade,
  reagent_id    uuid references reagents(id),   -- 목록에서 담았으면 연결, 직접입력이면 null
  name          text not null,                  -- 시약명(구체적 제품명)
  company       text,                           -- 회사
  cas_no        text,
  cat_no        text,
  state         text,                           -- 성상 (고체/액체/기타)
  spec          text,                           -- 규격 (용량/단위)
  quantity      text,
  purpose       text,                           -- 용도
  note          text                            -- 비고
);

create table if not exists purchase_request_goods_items (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references purchase_request_logs(id) on delete cascade,
  name               text not null,             -- 제품명
  spec               text,                      -- 규격
  quantity           numeric,
  unit_price         numeric,                   -- 단가
  shipping_fee       numeric,                   -- 배송비
  total_price        numeric,                   -- 총가격 (배송비 포함, 앱에서 계산해 저장)
  note               text,                      -- 비고
  link               text,                      -- 구매 링크
  purpose            text                       -- 용도
);

create index if not exists idx_pr_reagent_items_request on purchase_request_reagent_items(request_id);
create index if not exists idx_pr_goods_items_request    on purchase_request_goods_items(request_id);

comment on table purchase_request_logs is '구매요청서 헤더. 승인/발주 상태 없음 — 작성 기록만 남김.';
comment on table purchase_request_reagent_items is '요청서 내 시약 항목 (기존 시약 목록 연동 또는 직접입력).';
comment on table purchase_request_goods_items is '요청서 내 물품(기자재) 항목.';
