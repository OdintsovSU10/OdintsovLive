import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import type { PhotoFrame } from '../types'

interface Props {
  src: string
  alt: string
  frame: PhotoFrame
}

// object-position ставит точку фокуса на то же место контейнера, scale вокруг неё — приближает.
// Итог: левый край = −x·(zoom·ширина − контейнер), фокус в кадре при любом соотношении сторон.
export function frameStyle(frame: PhotoFrame): CSSProperties {
  const position = `${frame.x * 100}% ${frame.y * 100}%`
  return { objectPosition: position, transformOrigin: position, transform: `scale(${frame.zoom})` }
}

export const FramedPhoto = forwardRef<HTMLImageElement, Props>(({ src, alt, frame }, ref) => (
  <img ref={ref} className="car-framed-photo" src={src} alt={alt} style={frameStyle(frame)} draggable={false} />
))

FramedPhoto.displayName = 'FramedPhoto'
