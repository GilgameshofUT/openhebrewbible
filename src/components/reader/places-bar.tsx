'use client'

import { useEffect, useState } from 'react'
import { loadPlacesForChapter, type GeoPlace } from '@/data/tanakh'
import { mapLinkUrl } from './study-panel'
import { PlaceMap } from './place-map'
import { Modal } from './modal'

/**
 * Chapter-level place bar. Lists every place the geocoding index mentions in
 * this chapter; clicking a chip opens a modal with its Google Maps embed.
 */
export function ChapterPlaces({ bookId, chapter }: { bookId: string; chapter: number }) {
  const [byVerse, setByVerse] = useState<Record<string, GeoPlace[]>>({})
  const [openPlace, setOpenPlace] = useState<GeoPlace | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    let active = true
    setByVerse({})
    void loadPlacesForChapter(bookId, chapter).then((result) => {
      if (active) setByVerse(result)
    })
    return () => { active = false }
  }, [bookId, chapter])

  // A place can be mentioned in several verses of a chapter; list it once.
  const places = [...new Map(Object.values(byVerse).flat().map((place) => [place.id, place])).values()]
  const collapsible = places.length > 3

  useEffect(() => {
    if (!places.length) return
    setExpanded(!collapsible)
  }, [places.length, collapsible])

  if (!places.length) return null

  return (
    <div className="chapter-places">
      {collapsible ? (
        <button
          type="button"
          className="chapter-places-label chapter-places-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="chapter-place-list"
        >
          Places
        </button>
      ) : (
        <span className="chapter-places-label">Places</span>
      )}
      {(!collapsible || expanded) && (
        <div id="chapter-place-list" className="chapter-place-links">
          {places.map((place) => (
            <button type="button" key={place.id} className="place-chip" onClick={() => setOpenPlace(place)}>
              {place.name} · {place.types[0] ?? 'place'}
            </button>
          ))}
        </div>
      )}
      {openPlace && (
        <Modal className="modal-backdrop" onClose={() => setOpenPlace(null)} labelledBy="place-modal-title">
          <section className="occurrence-modal place-modal">
            <header>
              <div>
                <span className="label">Place</span>
                <h2 id="place-modal-title">{openPlace.name}</h2>
              </div>
              <button type="button" onClick={() => setOpenPlace(null)} aria-label="Close place">×</button>
            </header>
            {openPlace.types.length ? <p className="place-type">{openPlace.types.join(' · ')}</p> : null}
            {openPlace.modernName && openPlace.modernName !== openPlace.name ? (
              <p className="place-modern">modern {openPlace.modernName}</p>
            ) : null}
            {openPlace.flags?.length ? (
              <div className="place-flags" role="note">
                {openPlace.flags.map((flag) => <span key={flag}>⚠ {flag}</span>)}
              </div>
            ) : null}
            <PlaceMap place={openPlace} large />
            <div className="place-meta">
              {openPlace.confidence ? (
                <span className="place-confidence">
                  Identification {openPlace.confidence.voteAverage >= 400 ? 'high' : openPlace.confidence.voteAverage >= 100 ? 'medium' : 'low'} confidence
                  {openPlace.confidence.voteCount > 1 ? ` (${openPlace.confidence.voteCount} sources)` : ''}
                </span>
              ) : null}
              {openPlace.wikidataId ? (
                <a className="place-wikidata" href={`https://www.wikidata.org/wiki/${openPlace.wikidataId}`} target="_blank" rel="noreferrer">
                  Wikidata ↗
                </a>
              ) : null}
            </div>
            <p className="modal-status">
              <a href={mapLinkUrl(openPlace)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
            </p>
          </section>
        </Modal>
      )}
    </div>
  )
}