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

type GeoPlace = { id: string; name: string; slug: string; types: string[]; lonlat: string; modernName?: string; thumbnailUrl?: string; confidence?: { voteAverage: number; voteCount: number }; wikidataId?: string; geometry?: { kind: 'point' | 'path' | 'polygon'; geometryId: string }; flags?: string[]; shape?: { polygons: number[][][][]; paths: number[][][] } }
type Index = { source: string; places: Record<string, GeoPlace>; byVerse: Record<string, string[]>; byLexicon: Record<string, string[]> }

maybe('geocoding index', () => {
  const index = JSON.parse(readFileSync(geocodingPath, 'utf8')) as Index
  const lexicon = JSON.parse(readFileSync(lexiconPath, 'utf8')) as Record<string, { id: string; gloss?: string }>

  it('every place has a valid lonlat coordinate pair', () => {
    const offenders = Object.values(index.places).filter((place) => {
      const [lon, lat] = place.lonlat.split(',')
      return !(lon && lat && Number.isFinite(Number(lon)) && Number.isFinite(Number(lat)))
    })
    expect(offenders.map((place) => place.id)).toEqual([])
  })

  it('carries confidence, geometry, and linked-data enrichment', () => {
    const places = Object.values(index.places)
    // Every place carries an upstream vote, and a valid Wikidata id or none.
    expect(places.filter((place) => !place.confidence?.voteAverage)).toEqual([])
    for (const place of places) {
      if (place.wikidataId) expect(place.wikidataId).toMatch(/^Q\d+$/)
      if (place.geometry) {
        expect(place.geometry.kind).toMatch(/^(point|path|polygon)$/)
        expect(place.geometry.geometryId).toMatch(/^a[0-9a-f]{6}$/)
      }
    }
    // A known region keeps its shape and a settlement its point.
    const seaOfGalilee = places.find((place) => place.name === 'Sea of Galilee')
    const damascus = places.find((place) => place.name === 'Damascus')
    expect(seaOfGalilee?.geometry?.kind).toBe('polygon')
    expect(seaOfGalilee?.wikidataId).toBeDefined()
    expect(damascus?.geometry?.kind).toBe('point')
  })

  it('ships a self-hosted shape for every non-point place', () => {
    const geometryPath = join(generated, 'geocoding-geometry.json')
    if (!existsSync(geometryPath)) return
    const geometry = JSON.parse(readFileSync(geometryPath, 'utf8')) as Record<string, { polygons: number[][][][]; paths: number[][][] }>
    const missing: string[] = []
    for (const place of Object.values(index.places)) {
      if (place.geometry && place.geometry.kind !== 'point') {
        const shape = geometry[place.geometry.geometryId]
        if (!shape || (!shape.polygons.length && !shape.paths.length)) missing.push(place.name)
      }
    }
    expect(missing).toEqual([])
    // The shape is in [lat, lng] order for Leaflet.
    const seaOfGalilee = Object.values(index.places).find((place) => place.name === 'Sea of Galilee')
    const shape = seaOfGalilee?.geometry ? geometry[seaOfGalilee.geometry.geometryId] : undefined
    if (shape?.polygons?.[0]?.[0]?.[0]) expect(shape.polygons[0][0][0].length).toBe(2)
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

  it('links spelling variants but not unrelated translation renderings', () => {
    // Ebronah/Abronah is a legitimate spelling variant recorded upstream.
    const ebronah = Object.values(lexicon).find((entry) => entry.id === 'jaj')
    const abronah = Object.values(index.places).find((place) => place.name === 'Abronah')
    expect(ebronah && abronah ? index.byLexicon[ebronah.id] : undefined).toContain(abronah?.id)
  })

  it('links a place word by alternate root when the place is cited elsewhere', () => {
    // Num 34:11's word כִּנֶּרֶת is the Sea of Galilee, but upstream cites
    // that verse for the place "Sea of Galilee" whose alternate root is
    // Chinnereth — the same lake, linked from the same word.
    const chinnereth = Object.values(lexicon).find((entry) => entry.gloss === 'Chinnereth')
    const seaOfGalilee = Object.values(index.places).find((place) => place.name === 'Sea of Galilee')
    expect(chinnereth && seaOfGalilee ? index.byLexicon[chinnereth.id] : undefined).toContain(seaOfGalilee?.id)
  })

  it('never links a person-name entry to a lookalike place', () => {
    // KJV spells Tyre "Tyrus", one edit from "Cyrus" — the king, mentioned in
    // the same Ezra 3:7 that names Tyre. The fuzzy matcher must not collapse
    // them, or clicking כּוֹרֶשׁ shows a Tyre card.
    const cyrus = Object.values(lexicon).find((entry) => entry.gloss === 'Cyrus')
    const tyre = Object.values(index.places).find((place) => place.name === 'Tyre')
    expect(cyrus && tyre ? (index.byLexicon[cyrus.id] ?? []) : []).not.toContain(tyre?.id)
  })

  it('strips BDB cross-reference annotations from glosses before matching', () => {
    // BDB glosses carry notes like "Abdon. Compare" and "Lebaoth. See also";
    // those notes must not be part of the name, or the place never links.
    const abdon = Object.values(lexicon).find((entry) => entry.gloss === 'Abdon. Compare')
    const abdonPlace = Object.values(index.places).find((place) => place.name === 'Abdon')
    expect(abdon && abdonPlace ? index.byLexicon[abdon.id] : undefined).toContain(abdonPlace?.id)

    const chebar = Object.values(lexicon).find((entry) => entry.gloss === 'Chebar. Compare')
    const chebarPlace = Object.values(index.places).find((place) => place.name === 'Chebar')
    expect(chebar && chebarPlace ? index.byLexicon[chebar.id] : undefined).toContain(chebarPlace?.id)
  })

  it('links a place word by transliteration when its gloss is a definition', () => {
    // BDB glosses אָבֵל כְּרָמִים as "plain of the vineyards" (a definition),
    // but its transliteration is ʾābēl kĕrāmîm = the place name. The word is
    // still a proper noun (HNp) and appears in Judg 11:33, which upstream
    // cites for Abel-keramim — so it must link despite the gloss mismatch.
    const abelKeramim = Object.values(lexicon).find((entry) => entry.gloss === 'plain of the vineyards')
    const place = Object.values(index.places).find((item) => item.name === 'Abel-keramim')
    expect(abelKeramim && place ? index.byLexicon[abelKeramim.id] : undefined).toContain(place?.id)

    // Same class: Dan's word resolves to the entry glossed "Daniel" (the
    // person), but its transliteration dān is the city Dan.
    const daniel = Object.values(lexicon).find((entry) => entry.gloss === 'Daniel' && entry.id === 'cvn')
    const dan = Object.values(index.places).find((item) => item.name === 'Dan')
    expect(daniel && dan ? index.byLexicon[daniel.id] : undefined).toContain(dan?.id)
  })

  it('links unprefixed proper nouns without an explicit part of speech', () => {
    // The word for Mount Nebo in Deut 32:49 has morphology HNp and an empty
    // lexicon partOfSpeech. A boundary-anchored \bNp\b regex matches neither
    // that nor any bare HNp form (the H is a word character, so there is no
    // boundary before Np), silently dropping every unprefixed place word
    // lacking an n.pr.* tag. Np must be terminal or slash-delimited, which
    // still excludes Niphal verbs (HVNp3cs).
    const nebo = Object.values(lexicon).find((entry) => entry.id === 'hyf')
    const mountNebo = Object.values(index.places).find((place) => place.name === 'Mount Nebo')
    expect(nebo && mountNebo ? index.byLexicon[nebo.id] : undefined).toContain(mountNebo?.id)
  })

  it('fuzzy-matches transliteration drift but not lookalike places', () => {
    // BDB spells Josh 12:20 "Shimon-meron" where upstream says Shimron-meron;
    // one edit apart, so the length-aware fuzzy rule links them.
    const shimonMeron = Object.values(lexicon).find((entry) => entry.id === 'nbp')
    const shimronMeron = Object.values(index.places).find((place) => place.name === 'Shimron-meron')
    expect(shimonMeron && shimronMeron ? index.byLexicon[shimonMeron.id] : undefined).toContain(shimronMeron?.id)

    // Gath and Gaza are two edits apart at four letters — distinct Philistine
    // cities that must never share a link.
    const gath = Object.values(lexicon).find((entry) => entry.gloss === 'Gath')
    const gaza = Object.values(index.places).find((place) => place.name === 'Gaza')
    expect(gath && gaza ? index.byLexicon[gath.id] : []).not.toContain(gaza?.id)

    // Sodom and Edom likewise differ in two letters at four.
    const sodom = Object.values(lexicon).find((entry) => entry.gloss === 'Sodom')
    const edom = Object.values(index.places).find((place) => place.name === 'Edom')
    expect(sodom && edom ? index.byLexicon[sodom.id] : []).not.toContain(edom?.id)
  })

  it('never links a place to an entry via a cross-name rendering', () => {
    // Upstream records "Tyre" as a translation rendering of Babylon in one
    // verse, and "Gilgal" of Galilee. Those are disagreements between English
    // translations, not the Hebrew name's referent — linking them would show
    // a Babylon card when the reader clicks צֹר. Only near-spelling variants
    // may auto-link; scholarly equivalences belong in the override map.
    const tyre = Object.values(lexicon).find((entry) => entry.id === 'lad')
    const babylon1 = Object.values(index.places).find((place) => place.name === 'Babylon 1')
    expect(tyre && babylon1 ? index.byLexicon[tyre.id] : []).not.toContain(babylon1?.id)

    const galilee2 = Object.values(index.places).find((place) => place.name === 'Galilee 2')
    const gilgalEntries = Object.values(lexicon).filter((entry) => entry.gloss === 'Gilgal')
    for (const entry of gilgalEntries) {
      if (galilee2) expect(index.byLexicon[entry.id] ?? []).not.toContain(galilee2.id)
    }
  })
})