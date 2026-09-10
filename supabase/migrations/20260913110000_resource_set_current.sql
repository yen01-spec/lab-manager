-- 자료 탭 관리자 CMS — "현재 자료로 지정" 전용 RPC (개편 Phase 5-h2b).
--
-- 같은 버전 그룹(category_key, section_key, resource_key) 안에서 대상 1건만 is_current=true,
-- 나머지는 false 로 만든다. 프론트에서 UPDATE 를 2번(현재→false / 대상→true) 나눠 실행하면
-- 중간 실패 시 "현재 자료 0건" 상태가 생길 수 있으므로, 반드시 이 함수(단일 트랜잭션) 로만 처리한다.
--
-- 권한: public.is_admin() 통과한 Supabase Auth 관리자만. (resource_files RLS 와 동일 기준)
-- resource_key IS NULL(단독 자료) 은 버전 그룹이 없으므로 대상만 현재로 올리고 다른 행은 건드리지 않는다.
--   (부분 unique index resource_files_one_current_idx 도 resource_key IS NULL 은 제외한다.)
--
-- 기존 데이터/정책을 지우지 않는다. 함수 추가만.

create or replace function public.set_resource_current(target_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if not public.is_admin() then
    raise exception '자료관리 권한이 없습니다.' using errcode = '42501';
  end if;

  select id, category_key, section_key, resource_key
    into t
    from public.resource_files
   where id = target_resource_id;

  if not found then
    raise exception '대상 자료를 찾을 수 없습니다: %', target_resource_id using errcode = 'P0002';
  end if;

  if t.resource_key is null then
    -- 단독 자료: 버전 그룹이 없다. 대상만 현재로.
    update public.resource_files
       set is_current = true, updated_at = now()
     where id = t.id
       and is_current is distinct from true;
  else
    -- 같은 (category, section, resource_key) 그룹에서 대상만 현재. 단일 UPDATE = 원자적.
    update public.resource_files
       set is_current = (id = t.id), updated_at = now()
     where category_key = t.category_key
       and section_key  = t.section_key
       and resource_key  = t.resource_key
       and is_current is distinct from (id = t.id);
  end if;
end;
$$;

comment on function public.set_resource_current(uuid) is
  '자료 CMS: 같은 버전 그룹에서 대상 1건만 is_current 로 전환(단일 트랜잭션). is_admin() 필요.';

revoke all on function public.set_resource_current(uuid) from public;
grant execute on function public.set_resource_current(uuid) to authenticated;
