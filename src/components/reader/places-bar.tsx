'use client'

import { useEffect, useState } from 'react'
import { loadPlacesForChapter, type GeoPlace } from '@/data/tanakh'
import { mapEmbedUrl, mapLinkUrl } from './study-panel'
import { Modal } from './modal'

/**
 * Chapter-level place bar. Lists every place the geocoding index mentions in
 * this chapter; clicking a chip opens a modal with its Google Maps embed.
 */
export function ChapterPlaces({ bookId, chapter }: { bookId: string; chapter: number }) {
  const [byVerse, setByVerse] = useState<Record<string, GeoPlace[]>>({})
  const [openPlace, setOpenPlace] = useState<GeoPlace | null>(null)

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
  if (!places.length) return null

  return (
    <div className="chapter-places">
      <span className="chapter-places-label">🗺 Places</span>
      <div className="chapter-place-links">
        {places.map((place) => (
          <button type="button" key={place.id} className="place-chip" onClick={() => setOpenPlace(place)}>
            {place.name} · {place.types[0] ?? 'place'}
          </button>
        ))}
      </div>
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
            <iframe
              title={`Map of ${openPlace.name}`}
              src={mapEmbedUrl(openPlace)}
              className="place-map place-map-large"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <p className="modal-status">
              <a href={mapLinkUrl(openPlace)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
            </p>
          </section>
        </Modal>
      )}
    </div>
  )
}