// PostgREST/Supabase는 기본적으로 응답을 1000행으로 제한한다.
// queryFn(from, to)가 .range(from, to)를 적용한 쿼리를 반환하도록 만들어서 넘기면,
// 결과가 1000행 미만이 될 때까지 반복 조회해서 전체를 모아준다.
export async function fetchAllPages(queryFn) {
  let all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}
