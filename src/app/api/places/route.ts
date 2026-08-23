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

async function attachGeometry(place: GeoPlace): Promise<PlaceWithGeometry> {
  const geometryId = place.geometry?.geometryId
  if (!geometryId) return place
  const geometry = await getGeocodingGeometry().catch(() => null)
  const shape = geometry?.[geometryId]
  return shape ? { ...place, shape } : place
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const lexiconId = params.get('lexiconId')

  const index = await getGeocodingIndex().catch(() => null)
  if (lexiconId) {
    const placeIds = index?.byLexicon[lexiconId] ?? []
    const places = await Promise.all(
      placeIds.map((id) => index?.places[id]).filter((place): place is GeoPlace => Boolean(place)).map(attachGeometry),
    )
    return NextResponse.json({ places })
  }

  const validated = validateBookChapter(params.get('book'), params.get('chapter'))
  if (!validated.ok) return NextResponse.json({ byVerse: {}, error: validated.error }, { status: 400 })

  const { book, chapter } = validated.value
  if (!index) return NextResponse.json({ byVerse: {} })

  const byVerse: Record<string, PlaceWithGeometry[]> = {}
  for (const [verse, placeIds] of Object.entries(index.byVerse)) {
    const [bookId, chapterNumber, verseNumber] = verse.split(':')
    if (bookId !== book.id || Number(chapterNumber) !== chapter) continue
    byVerse[verseNumber] = await Promise.all(
      placeIds.map((id) => index.places[id]).filter((place): place is GeoPlace => Boolean(place)).map(attachGeometry),
    )
  }
  return NextResponse.json({ byVerse })
}