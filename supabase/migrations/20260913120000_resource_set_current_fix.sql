-- set_resource_current 수정 (개편 Phase 5-h2b).
--
-- 앞 migration(20260913110000)의 단일 UPDATE `set is_current = (id = target)` 는
-- 부분 unique index resource_files_one_current_idx 를 한 문장 안에서 순간적으로 위반한다
-- (한 행을 true 로 올리는 시점에 아직 기존 현재 자료가 true → 23505).
-- 부분 unique 는 index 라서 DEFERRABLE 로 만들 수 없다.
--
-- 해결: 함수 안에서 "먼저 그룹의 현재 자료를 내리고 → 대상만 올린다" 2문장으로 처리.
-- SECURITY DEFINER 함수 전체가 한 트랜잭션이므로 다른 세션에는 "현재 자료 0건" 중간 상태가
-- 절대 보이지 않는다(원자적). 프론트에서 UPDATE 를 나눠 호출하는 것과는 다르다.

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
    -- 1) 같은 그룹의 다른 현재 자료를 먼저 내린다.
    update public.resource_files
       set is_current = false, updated_at = now()
     where category_key = t.category_key
       and section_key  = t.section_key
       and resource_key  = t.resource_key
       and id <> t.id
       and is_current;
    -- 2) 대상만 올린다.
    update public.resource_files
       set is_current = true, updated_at = now()
     where id = t.id
       and is_current is distinct from true;
  end if;
end;
$$;

revoke all on function public.set_resource_current(uuid) from public;
grant execute on function public.set_resource_current(uuid) to authenticated;
