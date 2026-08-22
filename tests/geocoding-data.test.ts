/**
 * Data-shape regression tests for the geocoding index.
 *
 * The index is derived from openbible.info's Bible-Geocoding-Data and the
 * reverse citation map. Two classes of defect would be invisible in code
 * review:
 *
 * 1. Versification: upstream references are Protestant (USX); the index must
 *    be keyed by Jewish references, or chapter maps silently miss places.
 * 2. Word linking: every byLexicon id must resolve to a real lexicon entry,
 *    and every verse key must resolve to a real corpus verse.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const generated = join(process.cwd(), 'data', 'generated')
const geocodingPath = join(generated, 'geocoding-index.json')
const lexiconPath = join(generated, 'oshb-lexicon.json')
const booksDir = join(generated, 'books')

// The derived artifacts are gitignored, so skip when they are absent.
const derived = existsSync(geocodingPath) && existsSync(lexiconPath)
const maybe = derived ? describe : describe.skip

type GeoPlace = { id: string; name: string; slug: string; types: string[]; lonlat: string; modernName?: string; thumbnailUrl?: string }
type Index = { source: string; places: Record<string, GeoPlace>; byVerse: Record<string, string[]>; byLexicon: Record<string, string[]> }

maybe('geocoding index', () => {
  const index = JSON.parse(readFileSync(geocodingPath, 'utf8')) as Index
  const lexicon = JSON.parse(readFileSync(lexiconPath, 'utf8')) as Record<string, { id: string }>

  it('every place has a valid lonlat coordinate pair', () => {
    const offenders = Object.values(index.places).filter((place) => {
      const [lon, lat] = place.lonlat.split(',')
      return !(lon && lat && Number.isFinite(Number(lon)) && Number.isFinite(Number(lat)))
    })
    expect(offenders.map((place) => place.id)).toEqual([])
  })

  it('every verse key resolves to a real corpus verse', () => {
    const bookCache = new Map<string, Record<string, Array<{ number: number }>>>()
    const offenders: string[] = []
    for (const key of Object.keys(index.byVerse)) {
      const [bookId, chapter, verse] = key.split(':')
      let book = bookCache.get(bookId)
      if (!book) {
        try {
          const parsed = JSON.parse(readFileSync(join(booksDir, `${bookId}.json`), 'utf8')) as Record<string, Array<{ number: number }>>
          book = parsed
        } catch {
          offenders.push(`${key} (unknown book ${bookId})`)
          continue
        }
        bookCache.set(bookId, book)
      }
      if (!book[chapter]?.some((item) => item.number === Number(verse))) offenders.push(key)
    }
    expect(offenders).toEqual([])
  })

  it('every byVerse place id exists in the places table', () => {
    const offenders: string[] = []
    for (const [key, placeIds] of Object.entries(index.byVerse)) {
      for (const placeId of placeIds) if (!index.places[placeId]) offenders.push(`${key} -> ${placeId}`)
    }
    expect(offenders).toEqual([])
  })

  it('every byLexicon entry id resolves to a real lexicon entry', () => {
    const entryIds = new Set(Object.values(lexicon).map((entry) => entry.id))
    const offenders = Object.keys(index.byLexicon).filter((id) => !entryIds.has(id))
    expect(offenders).toEqual([])
  })

  it('every byLexicon place id exists in the places table', () => {
    const offenders: string[] = []
    for (const [entryId, placeIds] of Object.entries(index.byLexicon)) {
      for (const placeId of placeIds) if (!index.places[placeId]) offenders.push(`${entryId} -> ${placeId}`)
    }
    expect(offenders).toEqual([])
  })

  it('links known proper-noun entries to their places', () => {
    // The Abana river (Barada) is Hebrew אֲמָנָה, glossed "Amana" by BDB.
    const amanaId = Object.values(lexicon).find((entry) => entry.id === 'avx')?.id
    const damascusId = Object.values(lexicon).find((entry) => entry.id === 'cvm')?.id
    const abana = Object.values(index.places).find((place) => place.name === 'Abana')
    const damascus = Object.values(index.places).find((place) => place.name === 'Damascus')
    if (!amanaId || !damascusId || !abana || !damascus) throw new Error('expected lexicon entries or places missing')
    expect(index.byLexicon[amanaId]).toContain(abana.id)
    expect(index.byLexicon[damascusId]).toContain(damascus.id)
  })
})