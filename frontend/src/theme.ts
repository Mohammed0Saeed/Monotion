import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'maki_theme'
const lightQuery = () => matchMedia('(prefers-color-scheme: light)')

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (lightQuery().matches ? 'light' : 'dark') : pref
}

function applyTheme(pref: ThemePref) {
  const theme = resolveTheme(pref)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#191919')
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => (localStorage.getItem(KEY) as ThemePref) || 'system')

  useEffect(() => {
    applyTheme(pref)
    localStorage.setItem(KEY, pref)
    if (pref !== 'system') return
    const mq = lightQuery()
    const follow = () => applyTheme('system')
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [pref])

  /** Change theme; where supported, the new theme spreads out in a circle from the clicked control. */
  function setTheme(next: ThemePref, origin?: { x: number; y: number }) {
    const apply = () => { flushSync(() => setPref(next)); applyTheme(next) }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!document.startViewTransition || reduced || resolveTheme(next) === resolveTheme(pref)) return apply()
    const root = document.documentElement.style
    root.setProperty('--vt-x', `${origin?.x ?? innerWidth / 2}px`)
    root.setProperty('--vt-y', `${origin?.y ?? 0}px`)
    document.startViewTransition(apply)
  }

  return [pref, setTheme] as const
}
