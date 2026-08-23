import { NextResponse } from 'next/server'
import { validateBookChapter } from '@/lib/books'
import { getGeocodingIndex, getGeocodingGeometry, type GeoPlace, type GeocodingGeometry } from '@/lib/corpus'

/**
 * Returns the places mentioned in a chapter (grouped by verse) or the places
 * linked to a selected lexicon entry. Each shape place carries its own
 * polygon/path coordinates, served from the self-hosted geometry file — the
 * client draws the shape without fetching upstream geometry at runtime.
 * A missing index yields empty results rather than a failure.
 */
type PlaceWithGeometry = GeoPlace & { shape?: GeocodingGeometry }

let byChapterCache: Map<string, Record<string, string[]>> | null = null
let byChapterSource: unknown = null

function getByVerseForChapter(
  index: NonNullable<Awaited<ReturnType<typeof getGeocodingIndex>>>,
  bookId: string,
  chapter: number,
): Record<string, string[]> {
  if (byChapterSource !== index) {
    const map = new Map<string, Record<string, string[]>>()
    for (const [verse, placeIds] of Object.entries(index.byVerse)) {
      const lastColon = verse.lastIndexOf(':')
      const chapterKey = verse.slice(0, lastColon)
      const verseNumber = verse.slice(lastColon + 1)
      const bucket = map.get(chapterKey) ?? {}
      bucket[verseNumber] = placeIds
      map.set(chapterKey, bucket)
    }
    byChapterCache = map
    byChapterSource = index
  }
  return byChapterCache!.get(`${bookId}:${chapter}`) ?? {}
}

function attachGeometry(place: GeoPlace, geometry: Record<string, GeocodingGeometry> | null): PlaceWithGeometry {
  const geometryId = place.geometry?.geometryId
  if (!geometryId || !geometry) return place
  const shape = geometry[geometryId]
  return shape ? { ...place, shape } : place
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const lexiconId = params.get('lexiconId')

  const index = await getGeocodingIndex().catch(() => null)
  if (lexiconId) {
    const placeIds = index?.byLexicon[lexiconId] ?? []
    const rawPlaces = placeIds.map((id) => index?.places[id]).filter((place): place is GeoPlace => Boolean(place))
    const needsGeometry = rawPlaces.some((p) => Boolean(p.geometry?.geometryId))
    const geometry = needsGeometry ? await getGeocodingGeometry().catch(() => null) : null
    const places = rawPlaces.map((place) => attachGeometry(place, geometry))
    return NextResponse.json({ places }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })
  }

  const validated = validateBookChapter(params.get('book'), params.get('chapter'))
  if (!validated.ok) return NextResponse.json({ byVerse: {}, error: validated.error }, { status: 400 })

  const { book, chapter } = validated.value
  if (!index) return NextResponse.json({ byVerse: {} }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })

  const byVerseForChapter = getByVerseForChapter(index, book.id, chapter)
  const needsGeometry = Object.values(byVerseForChapter).some((ids) =>
    ids.some((id) => Boolean(index.places[id]?.geometry?.geometryId)),
  )
  const geometry = needsGeometry ? await getGeocodingGeometry().catch(() => null) : null

  const byVerse: Record<string, PlaceWithGeometry[]> = {}
  for (const [verseNumber, placeIds] of Object.entries(byVerseForChapter)) {
    const rawPlaces = placeIds.map((id) => index.places[id]).filter((place): place is GeoPlace => Boolean(place))
    byVerse[verseNumber] = rawPlaces.map((place) => attachGeometry(place, geometry))
  }
  return NextResponse.json({ byVerse }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })
}
