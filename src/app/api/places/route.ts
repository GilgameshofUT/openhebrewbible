import { NextResponse } from 'next/server'
import { validateBookChapter } from '@/lib/books'
import { getGeocodingIndex, type GeoPlace } from '@/lib/corpus'

/**
 * Returns the places mentioned in a chapter (grouped by verse) or the places
 * linked to a selected lexicon entry. The geocoding index is an optional
 * enrichment: a missing index yields empty results rather than a failure.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const lexiconId = params.get('lexiconId')

  const index = await getGeocodingIndex().catch(() => null)
  if (lexiconId) {
    const placeIds = index?.byLexicon[lexiconId] ?? []
    const places = placeIds.map((id) => index?.places[id]).filter((place): place is GeoPlace => Boolean(place))
    return NextResponse.json({ places })
  }

  const validated = validateBookChapter(params.get('book'), params.get('chapter'))
  if (!validated.ok) return NextResponse.json({ byVerse: {}, error: validated.error }, { status: 400 })

  const { book, chapter } = validated.value
  if (!index) return NextResponse.json({ byVerse: {} })

  const byVerse: Record<string, GeoPlace[]> = {}
  for (const [verse, placeIds] of Object.entries(index.byVerse)) {
    const [bookId, chapterNumber, verseNumber] = verse.split(':')
    if (bookId !== book.id || Number(chapterNumber) !== chapter) continue
    byVerse[verseNumber] = placeIds
      .map((id) => index.places[id])
      .filter((place): place is GeoPlace => Boolean(place))
  }
  return NextResponse.json({ byVerse })
}