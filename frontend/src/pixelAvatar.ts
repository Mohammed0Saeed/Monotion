/** Random animal photos from Wikimedia Commons, squashed into a few pixels for a profile picture. */

export type Animal = 'bird' | 'cat' | 'horse'
export const ANIMALS: Animal[] = ['bird', 'cat', 'horse']

/** featured / quality photos only, so the crop is usually the animal and not a blurry field */
const SEARCH: Record<Animal, string> = {
  bird: 'deepcat:"Featured pictures of birds"',
  cat: 'incategory:Featured_pictures_of_cats|Quality_images_of_cats',
  horse: 'incategory:Featured_pictures_of_horses|Quality_images_of_horses',
}

const GRID = 18   // pixels per side; small enough to look like pixel art at 64px
const THUMB = 160 // width of the thumbnail Commons scales down for us

export interface PixelAvatar {
  image: string   // PNG data URL, GRID × GRID
  source: string  // the photo's page on Commons
}

async function randomPhoto(animal: Animal): Promise<{ url: string; page: string }> {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '1', gsrsort: 'random',
    gsrsearch: `filetype:bitmap ${SEARCH[animal]}`,
    prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(THUMB),
  })
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
  if (!res.ok) throw new Error(`Wikimedia Commons answered ${res.status}`)
  const data = await res.json()
  const info = Object.values<{ imageinfo?: { thumburl: string; descriptionurl: string }[] }>(data.query?.pages ?? {})[0]?.imageinfo?.[0]
  if (!info) throw new Error(`No ${animal} photo found, try again`)
  return { url: info.thumburl, page: info.descriptionurl }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // Commons sends CORS headers, so the canvas stays readable
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Couldn't load the photo"))
    img.src = url
  })
}

/** center square of the photo, averaged down to GRID × GRID */
function pixelate(img: HTMLImageElement): string {
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  // step down in halves; one big jump would sample a few pixels instead of averaging them
  let src: CanvasImageSource = img, sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2, size = side
  while (size / 2 > GRID) {
    const half = Math.max(GRID, Math.round(size / 2))
    const c = Object.assign(document.createElement('canvas'), { width: half, height: half })
    c.getContext('2d')!.drawImage(src, sx, sy, size, size, 0, 0, half, half)
    src = c; sx = sy = 0; size = half
  }
  const out = Object.assign(document.createElement('canvas'), { width: GRID, height: GRID })
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, sx, sy, size, size, 0, 0, GRID, GRID)
  return out.toDataURL('image/png')
}

export async function randomPixelAvatar(animal: Animal): Promise<PixelAvatar> {
  const photo = await randomPhoto(animal)
  return { image: pixelate(await load(photo.url)), source: photo.page }
}
