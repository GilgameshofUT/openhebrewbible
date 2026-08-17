export type Occurrence = {
  book: string
  chapter: number
  verse: number
  hebrew: string
  english: string
  words: string[]
}

export type PendingReference = { bookId: string; chapter: number; verse?: number }

export type AudioResource = {
  id: string
  provider?: string
  title: string
  url: string
  embedUrl?: string
}

export type NoteResource = {
  id: string
  provider: string
  title: string
  url: string
  embedUrl?: string
  kind: string
  resources?: NoteResource[]
}

export type EnglishMode = 'hidden' | 'beneath' | 'parallel'
export type { TranslationId } from '@/lib/translations'

/** Mechon Mamre entries are plain audio files; everything else is a SoundCloud embed. */
export const MECHON_PREFIX = 'mechon-mamre:'

export function isMechonMamre(resource: Pick<AudioResource, 'id'> | undefined) {
  return Boolean(resource?.id.startsWith(MECHON_PREFIX))
}

/** The subset of the SoundCloud Widget API the reader uses. */
export type SoundCloudWidget = {
  bind: (event: string, handler: (arg?: unknown) => void) => void
  getPosition: (callback: (position: number) => void) => void
  getDuration: (callback: (duration: number) => void) => void
  play: () => void
  seekTo: (milliseconds: number) => void
  pause: () => void
}
