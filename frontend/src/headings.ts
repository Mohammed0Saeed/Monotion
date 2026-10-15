import { COLORS } from './Group'

export type HeadingColor = typeof COLORS[number] | 'none'
const KEY = 'maki_heading_color'

/** Color of the headings in notes, on screen and in saved PDFs. Stored per device like the theme; purple until changed. */
export const headingColor = (): HeadingColor => (localStorage.getItem(KEY) as HeadingColor) || 'purple'
export const setHeadingColor = (color: HeadingColor) => localStorage.setItem(KEY, color)

/** Extra classes for a .md container: the palette class gives it --ac, which its headings take */
export const headingClass = (color = headingColor()) => (color === 'none' ? '' : ` colored-headings c-${color}`)
