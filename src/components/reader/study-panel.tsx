'use client'

import type { GeoPlace, LexiconEntry, LexiconSense, Word } from '@/data/tanakh'
import type { NoteResource } from './types'

type Relationship = NonNullable<LexiconEntry['lexicalRelationships']>[number]

/**
 * Keyless Google Maps embed for a coordinate pair. lonlat is stored as
 * "lon,lat" (upstream format); the embed wants "lat,lon".
 */
export function mapEmbedUrl(place: GeoPlace) {
  const [lon, lat] = place.lonlat.split(',')
  return `https://www.google.com/maps?q=${lat.trim()},${lon.trim()}&z=9&output=embed`
}

export function mapLinkUrl(place: GeoPlace) {
  const [lon, lat] = place.lonlat.split(',')
  return `https://www.google.com/maps/search/?api=1&query=${lat.trim()},${lon.trim()}`
}

/**
 * Renders the BDB sense tree as an outline. Verb entries group senses by
 * verbal stem, so a stem heading may carry no text of its own and exist only
 * to label the numbered senses nested beneath it.
 */
function SenseList({ senses, depth = 0 }: { senses: LexiconSense[]; depth?: number }) {
  return (
    <ol className={depth === 0 ? 'sense-list' : 'sense-list nested'}>
      {senses.map((sense, index) => (
        <li key={`${sense.stem ?? sense.number ?? index}-${sense.text}`}>
          {sense.stem ? <span className="sense-stem">{sense.stem}</span> : null}
          {sense.number ? <span className="sense-number">{sense.number}.</span> : null}
          {sense.text ? <span className="sense-text">{sense.text}</span> : null}
          {sense.references.length ? <small>{sense.references.join('; ')}</small> : null}
          {sense.senses?.length ? <SenseList senses={sense.senses} depth={depth + 1} /> : null}
        </li>
      ))}
    </ol>
  )
}

export function StudyPanel({
  word,
  entry,
  loading,
  lemmaNotes,
  places,
  renderNoteButton,
  onDismiss,
  onOpenOccurrences,
  onSelectRelationship,
}: {
  word: Word | null
  entry: LexiconEntry | undefined
  loading: boolean
  lemmaNotes: NoteResource[]
  places: GeoPlace[]
  renderNoteButton: (note: NoteResource) => React.ReactNode
  onDismiss: () => void
  onOpenOccurrences: () => void
  onSelectRelationship: (relationship: Relationship) => void
}) {
  if (!word) {
    return (
      <aside className="study-panel" aria-live="polite">
        <div className="study-empty">
          <div className="study-icon">✦</div>
          <h2>Choose a word</h2>
          <p>Select any Hebrew word to open its lexicon entry and study notes.</p>
          <div className="study-tip">
            <strong>Reading tip</strong>
            <span>Use the Hebrew-only view for a focused reading, or keep the translation beneath the text.</span>
          </div>
        </div>
      </aside>
    )
  }

  if (loading) {
    return (
      <aside className="study-panel" aria-live="polite">
        <div className="panel-kicker">
          <span>Word study <span>{word.id}</span></span>
          <button type="button" className="study-dismiss" onClick={onDismiss} aria-label="Close word study">Close ×</button>
        </div>
        <div className="study-loading">Loading lexicon entry…</div>
      </aside>
    )
  }

  if (!entry) {
    return (
      <aside className="study-panel" aria-live="polite">
        <div className="panel-kicker">
          <span>Word study <span>{word.id}</span></span>
          <button type="button" className="study-dismiss" onClick={onDismiss} aria-label="Close word study">Close ×</button>
        </div>
        <div className="study-empty">
          <p>No lexicon entry available for this word.</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="study-panel" aria-live="polite">
      <div className="panel-kicker">
        <span>Word study <span>{word.id}</span></span>
        <button type="button" className="study-dismiss" onClick={onDismiss} aria-label="Close word study">Close ×</button>
      </div>

      {word.qere ? (
        <div className="qere-display">
          <span className="label">Qere</span>
          <strong dir="rtl" lang="he">{word.qere}</strong>
        </div>
      ) : null}

      <div className="study-head">
        <h2 lang="he">{entry.headword}</h2>
        <p>{entry.transliteration}</p>
      </div>

      {lemmaNotes.length > 0 && (
        <div className="lemma-note-links">
          {lemmaNotes.map((note) => <span key={note.id}>{renderNoteButton(note)}</span>)}
        </div>
      )}

      <div className="study-section entry-meta">
        <div><span className="label">Gloss</span><strong>{entry.gloss}</strong></div>
        {entry.partOfSpeech?.length ? (
          <div><span className="label">Part of speech</span><strong>{entry.partOfSpeech.join(' · ')}</strong></div>
        ) : null}
      </div>

      <div className="study-section">
        <span className="label">Morphology</span>
        <strong>{word.morphologyLabel}</strong>
        <code>{word.morphology}</code>
      </div>

      {/* The gloss above is the short form; show the fuller definition only
          when it actually says more. */}
      {entry.definition && entry.definition !== entry.gloss ? (
        <div className="study-section definition">
          <span className="label">Definition</span>
          <p>{entry.definition}</p>
        </div>
      ) : null}

      {entry.senses?.length ? (
        <div className="study-section senses">
          <span className="label">BDB senses</span>
          <SenseList senses={entry.senses} />
        </div>
      ) : null}

      {entry.etymology ? (
        <div className="study-section">
          <span className="label">Lexical relationship</span>
          {entry.lexicalRelationships?.length ? (
            <div className="relationship-list">
              {entry.lexicalRelationships.map((relationship) => (
                <button type="button" key={relationship.id} onClick={() => onSelectRelationship(relationship)}>
                  <strong lang="he">{relationship.headword}</strong>
                  <span>{relationship.transliteration} · {relationship.gloss}</span>
                </button>
              ))}
            </div>
          ) : <p className="metadata-text">No related entries listed.</p>}
        </div>
      ) : null}

      <div className="study-section">
        <span className="label">Occurrences</span>
        <div className="reference-list">
          {entry.references.map((reference) => (
            <button type="button" key={reference} onClick={onOpenOccurrences}>{reference} ↗</button>
          ))}
        </div>
      </div>

      {places.length > 0 && (
        <div className="study-section places">
          <span className="label">Location</span>
          {places.map((place) => (
            <article className="place-card" key={place.id}>
              <header>
                <strong>{place.name}</strong>
                {place.modernName && place.modernName !== place.name ? (
                  <span className="place-modern">modern {place.modernName}</span>
                ) : null}
              </header>
              {place.types.length ? <span className="place-type">{place.types.join(' · ')}</span> : null}
              <iframe
                title={`Map of ${place.name}`}
                src={mapEmbedUrl(place)}
                className="place-map"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a className="place-link" href={mapLinkUrl(place)} target="_blank" rel="noreferrer">
                Open in Google Maps ↗
              </a>
            </article>
          ))}
        </div>
      )}

      <div className="panel-footer">
        <span>OSHB · WLC</span>
        <span>Source data</span>
      </div>
    </aside>
  )
}
