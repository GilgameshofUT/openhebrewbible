/**
 * Regression tests for the place-mapping feature in the word-study panel.
 *
 * The Location section couples a lexicon entry to a geocoding place; the map
 * embed URL is derived from the upstream lonlat pair (stored "lon,lat", which
 * Google Maps expects reversed). These assert both the URL derivation and the
 * panel rendering so neither can drift.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mapEmbedUrl, mapLinkUrl, StudyPanel } from '@/components/reader/study-panel'
import { PlaceMap } from '@/components/reader/place-map'
import type { GeoPlace, LexiconEntry, Word } from '@/data/tanakh'
import type { NoteResource } from '@/components/reader/types'

afterEach(() => { document.body.innerHTML = '' })

const place: GeoPlace = {
  id: 'a69c1d4',
  name: 'Damascus',
  slug: 'damascus',
  types: ['settlement'],
  lonlat: '36.306390,33.511112',
  modernName: 'Damascus',
  thumbnailUrl: undefined,
}

const word: Word = {
  id: 'w1',
  text: 'דַּמֶּשֶׂק',
  lemma: '1834',
  morphology: 'HNp',
  morphologyLabel: 'Proper noun',
  lexiconId: 'cvm',
}

const entry: LexiconEntry = {
  id: 'cvm',
  headword: 'דַּמֶּשֶׂק',
  transliteration: 'dammeśeq',
  gloss: 'Damascus',
  definition: 'Damascus',
  morphology: 'HNp',
  references: ["Strong's H1834"],
}

const noop = () => {}

describe('map URL derivation', () => {
  it('reverses the lonlat pair for the Google Maps embed', () => {
    expect(mapEmbedUrl(place)).toContain('q=33.511112,36.306390')
    expect(mapEmbedUrl(place)).toContain('output=embed')
  })

  it('builds a plain Google Maps search link from the same pair', () => {
    expect(mapLinkUrl(place)).toContain('query=33.511112,36.306390')
  })
})

describe('study panel location section', () => {
  function renderPanel(places: GeoPlace[]) {
    return render(
      <StudyPanel
        word={word}
        entry={entry}
        loading={false}
        lemmaNotes={[]}
        places={places}
        renderNoteButton={(note: NoteResource) => <button key={note.id}>note</button>}
        onDismiss={noop}
        onOpenOccurrences={noop}
        onSelectRelationship={noop}
      />,
    )
  }

  it('shows the place name and a map embed when places exist', () => {
    renderPanel([place])
    // "Damascus" appears as both the entry gloss and the place card name.
    expect(screen.getAllByText('Damascus').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTitle('Map of Damascus')).toBeDefined()
    expect(screen.getByRole('link', { name: /Open in Google Maps/ }).getAttribute('target')).toBe('_blank')
  })

  it('renders no location section when no place is linked', () => {
    renderPanel([])
    expect(screen.queryByText('Location')).toBeNull()
  })

  it('notes the modern identification when it differs from the ancient name', () => {
    const riverside = { ...place, name: 'Abana', modernName: 'Barada River' }
    renderPanel([riverside])
    expect(screen.getByText('Abana')).toBeDefined()
    expect(screen.getByText('modern Barada River')).toBeDefined()
  })

  it('shows confidence, uncertainty flags, Wikidata, and shape links', () => {
    const rich = {
      ...place,
      confidence: { voteAverage: 500, voteCount: 3 },
      flags: ['multiple possible locations', 'identification uncertain'],
      wikidataId: 'Q1000',
      geometry: { file: 'a.geojson', kind: 'polygon' as const, url: 'https://example.com/a.geojson' },
    }
    renderPanel([rich])
    expect(screen.getByText('Identification medium confidence (3 sources)')).toBeDefined()
    expect(screen.getByText('⚠ multiple possible locations')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Wikidata ↗' }).getAttribute('href')).toBe('https://www.wikidata.org/wiki/Q1000')
  })

  it('omits confidence and links when the data is absent', () => {
    renderPanel([place])
    expect(screen.queryByText(/Identification/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Wikidata ↗' })).toBeNull()
  })
})

describe('PlaceMap', () => {
  // Without a key (the test environment), the map must fall back to the
  // keyless embed iframe rather than attempting the JS API.
  it('falls back to the embed iframe when no API key is configured', () => {
    const shaped = { ...place, geometry: { file: 'a.geojson', kind: 'polygon' as const, url: 'https://example.com/a.geojson' } }
    render(<PlaceMap place={shaped} />)
    expect(screen.getByTitle('Map of Damascus')).toBeDefined()
  })
})