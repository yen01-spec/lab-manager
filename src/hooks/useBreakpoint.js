import { useEffect, useState } from 'react'

// Layout.jsx에 있던 걸 그대로 옮김(동작 동일) — 다른 페이지(재고실사 등)에서도
// 같은 기준으로 모바일/태블릿/데스크톱을 판단할 수 있도록 공용 훅으로 분리.
export function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const h = () => setWidth(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return { isMobile: width < 768, isTablet: width >= 768 && width < 1100, isDesktop: width >= 1100 }
}
