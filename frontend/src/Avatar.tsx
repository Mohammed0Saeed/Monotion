/** the pixelated animal photo if one is set, otherwise the initial letter */
export default function Avatar({ name, src, size = 28, busy = false }: { name: string; src?: string; size?: number; busy?: boolean }) {
  return (
    <span className={'avatar' + (src ? ' has-photo' : '') + (busy ? ' busy' : '')}
          style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {src ? <img src={src} alt="" width={size} height={size} /> : (name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}
