import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/** Measures the child marked data-active="true" so a pill can slide underneath it. */
export function useSlidingPill<T extends HTMLElement>(activeKey: unknown) {
  const ref = useRef<T>(null)
  const placed = useRef(false)
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 })

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const place = () => {
      const el = root.querySelector<HTMLElement>('[data-active="true"]')
      if (!el) { placed.current = false; setStyle({ opacity: 0 }); return }
      // first placement jumps into position instead of sliding in from the left edge
      setStyle({
        width: el.offsetWidth,
        transform: `translateX(${el.offsetLeft}px)`,
        opacity: 1,
        transition: placed.current ? undefined : 'none',
      })
      placed.current = true
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(root)
    return () => ro.disconnect()
  }, [activeKey])

  return [ref, style] as const
}
