import { useMemo } from 'react'
import { makePet } from './pets'

/** the account's pixel pet (bird, cat or horse) if it has one, otherwise the initial letter */
export default function Avatar({ name, seed, size = 28 }: { name: string; seed?: string; size?: number }) {
  const pet = useMemo(() => (seed ? makePet(seed) : null), [seed])
  if (!pet) {
    return (
      <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
        {(name.trim()[0] ?? '?').toUpperCase()}
      </span>
    )
  }
  // crisp edges keep the pixels square at any size; the key replays the pop-in on a reroll
  return (
    <svg key={seed} className="avatar pet" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges"
         role="img" aria-label={pet.description}>
      <rect width="16" height="16" fill={pet.background} />
      {pet.pixels.map(p => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={p.w} height="1" fill={p.color} />)}
    </svg>
  )
}
