// 시약목록에서 같은 이름(제조사/순도만 다른)의 시약을 한 줄로 묶어서 보여주기 위한 헬퍼.
// 이름만 보고 묶는 것뿐이라, CAS/유해정보 등은 여전히 각 시약(제품) 단위로 따로 관리됨.
export function normalizeReagentName(name) {
  return (name || '').trim().toLowerCase()
}

export function groupReagentsByName(reagents) {
  const map = new Map()
  for (const r of reagents) {
    const key = normalizeReagentName(r.name)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  return [...map.values()]
}
