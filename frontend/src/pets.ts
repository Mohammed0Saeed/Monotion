// Pixel-pet avatars: cats, birds and horses, all 16x16 and picked deterministically from a seed
// (the account's avatar_seed), so everyone keeps the same pet until they reroll it. Cats and birds
// come from Puffy's avatars and draw the same pet for the same seed. The species rides in the
// seed's prefix ("bird-…", "horse-…"); a seed without one is a cat.

export type Species = 'cat' | 'bird' | 'horse'

export const SPECIES: { key: Species; label: string }[] = [
  { key: 'bird', label: 'Bird' },
  { key: 'cat', label: 'Cat' },
  { key: 'horse', label: 'Horse' },
]

export interface Pixel { x: number; y: number; w: number; color: string }
export interface Pet { size: 16; background: string; pixels: Pixel[]; description: string }

export const speciesOf = (seed: string): Species => (/^bird-/.test(seed) ? 'bird' : /^horse-/.test(seed) ? 'horse' : 'cat')

export function randomPetSeed(species: Species = 'cat') {
  const id = Math.random().toString(36).slice(2, 10)
  return species === 'cat' ? id : `${species}-${id}`
}

const BACKGROUNDS = ['#dbe8f5', '#f5e1d8', '#e3f0dc', '#efe3f5', '#f5efd3', '#d8eef0', '#f2dde3']
const PUPIL = '#1b1b1f'

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: string) {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(rand: () => number, list: readonly T[]) => list[Math.floor(rand() * list.length)]
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

type Grid = string[][]
type Both = (x: number, y: number, c: string) => void

/** 8-wide rows are a left half mirrored into 16; 16-wide rows are used as they are.
 *  After tweaks, runs of one colour merge into rects, so a sprite is ~60 rects instead of 256. */
function render(rows: string[], colors: Record<string, string>, tweak?: (grid: Grid, both: Both) => void): Pixel[] {
  const grid = rows.map(row => (row.length === 8 ? [...row, ...[...row].reverse()] : [...row]))
  const both: Both = (x, y, c) => { grid[y][x] = c; grid[y][15 - x] = c }
  tweak?.(grid, both)
  const pixels: Pixel[] = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < 16) {
      const c = row[x]
      let w = 1
      while (x + w < 16 && row[x + w] === c) w++
      if (c !== '.') pixels.push({ x, y, w, color: colors[c] })
      x += w
    }
  })
  return pixels
}

// ── cats ─────────────────────────────────────────────────────────────────────
// . background  O outline  F fur  I inner ear  E eye  P pupil  N nose  M muzzle  w whisker
const CAT = [
  '........',
  '..O.....',
  '..OO....',
  '..OIO...',
  '..OIIOOO',
  '..OFFFFF',
  '.OFFFFFF',
  '.OFEEFFF',
  '.OFEPFFF',
  'wOFFFFFF',
  '.OFFFMMN',
  'wOFFMMOM',
  '..OFFMMM',
  '...OOFFF',
  '...OFFFF',
  '...OFFFF',
]
const FURS = [
  { name: 'ginger', fur: '#e8933a', stripe: '#c46a1f', line: '#6b3410' },
  { name: 'grey', fur: '#9aa3ad', stripe: '#737c87', line: '#3b4048' },
  { name: 'black', fur: '#3d3d44', stripe: '#2b2b31', line: '#141417' },
  { name: 'white', fur: '#f4f1eb', stripe: '#dcd5c8', line: '#7d776c' },
  { name: 'cream', fur: '#f1d7a8', stripe: '#dcb478', line: '#86663a' },
  { name: 'brown', fur: '#8a5a3b', stripe: '#6b4129', line: '#38200f' },
  { name: 'blue', fur: '#7d8aa6', stripe: '#5f6b86', line: '#2c3346' },
]
const PATTERNS = ['solid', 'tabby', 'tabby', 'tuxedo', 'patch', 'calico']
const CAT_EYES = ['#5fbf5a', '#e8c547', '#5aa8e8', '#e89a3a', '#9ccf4a']
const CAT_MOODS = ['open', 'open', 'open', 'happy', 'sleepy']

function makeCat(seed: string): Pet {
  const rand = rng(seed)
  let coat = pick(rand, FURS)
  let pattern = pick(rand, PATTERNS)
  if (pattern === 'tuxedo' && coat.name === 'white') pattern = 'solid' // white on white
  if (pattern === 'calico' || pattern === 'patch') coat = FURS[3] // white base under the patches
  const eye = pick(rand, CAT_EYES)
  const mood = pick(rand, CAT_MOODS)
  const background = pick(rand, BACKGROUNDS)
  const patchColor = pattern === 'calico' ? FURS[0].fur : pick(rand, [FURS[0].fur, FURS[2].fur, FURS[5].fur])
  const patchLeft = rand() < 0.5
  const muzzle = pattern === 'tuxedo' || coat.name === 'white' ? '#fbfaf7' : mix(coat.fur, '#ffffff', 0.55)

  const pixels = render(CAT, {
    O: coat.line, F: coat.fur, S: coat.stripe, I: '#f2a0a8', E: eye, P: PUPIL, N: '#e0707f', M: muzzle,
    w: coat.line, X: patchColor, K: FURS[2].fur,
  }, (grid, both) => {
    if (mood === 'happy') {
      for (const x of [3, 4]) { both(x, 7, 'F'); both(x, 8, 'F') }
      both(4, 7, 'O'); both(3, 8, 'O'); both(5, 8, 'O')
    } else if (mood === 'sleepy') {
      both(3, 7, 'F'); both(4, 7, 'F'); both(3, 8, 'O'); both(4, 8, 'O')
    }
    if (pattern === 'tabby') {
      both(5, 5, 'S'); both(7, 5, 'S'); both(7, 6, 'S')
      both(2, 9, 'S'); both(2, 10, 'S'); both(5, 14, 'S'); both(7, 15, 'S')
    }
    if (pattern === 'tuxedo') for (let y = 13; y < 16; y++) for (const x of [6, 7]) both(x, y, 'M')
    if (pattern === 'patch' || pattern === 'calico') {
      for (let y = 4; y < 10; y++) for (let x = 2; x < 8; x++) {
        const gx = patchLeft ? x : 15 - x
        if (grid[y][gx] === 'F') grid[y][gx] = 'X'
      }
      if (pattern === 'calico') for (let y = 13; y < 16; y++) for (let x = 8; x < 13; x++) {
        const gx = patchLeft ? x : 15 - x
        if (grid[y][gx] === 'F') grid[y][gx] = 'K'
      }
    }
  })
  const coatName = pattern === 'calico' ? 'calico' : pattern === 'patch' ? 'patched' : coat.name
  const kind = pattern === 'tabby' ? `${coatName} tabby` : pattern === 'tuxedo' ? `${coatName} tuxedo` : `${coatName} cat`
  return { size: 16, background, pixels, description: `A ${mood === 'happy' ? 'happy ' : mood === 'sleepy' ? 'sleepy ' : ''}${kind}` }
}

// ── birds ────────────────────────────────────────────────────────────────────
// O outline  C crest  F feathers  G wing  W belly  E eye glint  P eye  B beak  L legs
const BIRD = [
  '........',
  '........',
  '.....OOO',
  '....OFFF',
  '...OFFFF',
  '..OFEPFF',
  '..OFFPFF',
  '.OFFFFFB',
  '.OGFFFBB',
  '.OGGWWWB',
  '.OGGWWWW',
  '.OGGWWWW',
  '..OGWWWW',
  '...OOOOO',
  '.....L..',
  '....LLL.',
]
const BIRDS = [
  { name: 'blue jay', body: '#4a86c8', wing: '#2f5f99', belly: '#e8eef5' },
  { name: 'cardinal', body: '#d0393a', wing: '#9c2526', belly: '#f0c2b5' },
  { name: 'canary', body: '#f2c230', wing: '#d19a12', belly: '#fbe9a8' },
  { name: 'parrot', body: '#4fae4a', wing: '#2f7c33', belly: '#d9eeb0' },
  { name: 'robin', body: '#7a6a5a', wing: '#5a4c40', belly: '#e4733a' },
  { name: 'dove', body: '#a8adb5', wing: '#7f8590', belly: '#e6e2dc' },
  { name: 'flamingo', body: '#ef8fb0', wing: '#d16a92', belly: '#fbe0ea' },
]

function makeBird(seed: string): Pet {
  const rand = rng(seed)
  const kind = pick(rand, BIRDS)
  const crest = rand() < 0.45
  const sleepy = rand() < 0.2
  const background = pick(rand, BACKGROUNDS)
  const pixels = render(BIRD, {
    O: mix(kind.body, '#000000', 0.55), C: kind.wing, F: kind.body, G: kind.wing, W: kind.belly,
    E: '#ffffff', P: PUPIL, B: '#f0a020', L: '#e08a2a',
  }, (_grid, both) => {
    if (crest) { both(7, 0, 'C'); both(6, 1, 'C'); both(7, 1, 'C') }
    if (sleepy) { both(4, 5, 'F'); both(5, 5, 'F'); both(4, 6, 'O'); both(5, 6, 'O') }
  })
  return { size: 16, background, pixels, description: `A ${sleepy ? 'sleepy ' : ''}${kind.name}${crest ? ' with a crest' : ''}` }
}

// ── horses ───────────────────────────────────────────────────────────────────
// A head in profile, facing left (from the front a 16px horse reads as a dog).
// O outline  F coat  D mane  I inner ear  E eye glint  P eye  M muzzle  N nostril
const HORSE = [
  '........O.O.....',
  '.......OFOFO....',
  '......OFIFFDO...',
  '.....OFFFFFDDO..',
  '....OFEPFFFDDO..',
  '...OFFPPFFFFDDO.',
  '..OFFFFFFFFFDDO.',
  '.OMFFFFFFFFFFDDO',
  'OMMFFOOOFFFFFDDO',
  'ONMMO...OFFFFDDO',
  '.OOO....OFFFFDDO',
  '.......OFFFFFDDO',
  '.......OFFFFFFDO',
  '......OFFFFFFFDO',
  '......OFFFFFFFFO',
  '.....OFFFFFFFFFO',
]
const HORSE_COATS = [
  { name: 'bay', coat: '#9a5b34', mane: '#2b2220' },
  { name: 'chestnut', coat: '#b4602f', mane: '#8a4220' },
  { name: 'black', coat: '#3a3638', mane: '#1d1b1c' },
  { name: 'grey', coat: '#c7c9cd', mane: '#8d9096' },
  { name: 'palomino', coat: '#e0b665', mane: '#f6ead0' },
  { name: 'dun', coat: '#c9a77a', mane: '#4a3a2c' },
  { name: 'white', coat: '#f2efe9', mane: '#d6d0c4' },
]
const HORSE_LOOKS = ['plain', 'plain', 'blaze', 'star']

function makeHorse(seed: string): Pet {
  const rand = rng(seed)
  const coat = pick(rand, HORSE_COATS)
  const look = pick(rand, HORSE_LOOKS)
  const sleepy = rand() < 0.2
  const unicorn = rand() < 0.06 // rare
  const background = pick(rand, BACKGROUNDS)
  const white = coat.name === 'white' || coat.name === 'grey'
  const pixels = render(HORSE, {
    O: mix(coat.coat, '#000000', 0.6), F: coat.coat, D: coat.mane, I: mix(coat.coat, '#f2a0a8', 0.5),
    E: '#ffffff', P: PUPIL, M: mix(coat.coat, white ? '#6b6560' : '#2b2220', 0.45), N: PUPIL,
    W: '#fbfaf7', H: '#f2c94c', h: '#d9a521',
  }, grid => {
    // white down the front of the face
    if (look === 'blaze') for (const [x, y] of [[5, 3], [4, 4], [3, 5], [3, 6], [2, 7]]) grid[y][x] = 'W'
    if (look === 'star') { grid[3][6] = 'W'; grid[3][7] = 'W' }
    if (sleepy) { grid[4][6] = 'F'; grid[4][7] = 'O'; grid[5][6] = 'F'; grid[5][7] = 'F' }
    // horn above the forehead, in front of the ears
    if (unicorn) { grid[0][4] = 'H'; grid[0][5] = 'h'; grid[1][5] = 'H'; grid[1][6] = 'h' }
  })
  const marks = look === 'blaze' ? ' with a blaze' : look === 'star' ? ' with a star' : ''
  return {
    size: 16, background, pixels,
    description: `A ${unicorn ? 'rare ' : ''}${sleepy ? 'sleepy ' : ''}${coat.name} ${unicorn ? 'unicorn' : 'horse'}${marks}`,
  }
}

export function makePet(seed: string): Pet {
  const species = speciesOf(seed)
  return species === 'bird' ? makeBird(seed) : species === 'horse' ? makeHorse(seed) : makeCat(seed)
}
