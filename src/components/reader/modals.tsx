'use client'

import { useRef } from 'react'
import type { LexiconEntry } from '@/data/tanakh'
import { highlightWords } from './hebrew-text'
import { Modal } from './modal'
import type { NoteResource, Occurrence } from './types'

export function NoteModal({
  note,
  onClose,
  onOpenImage,
}: {
  note: NoteResource
  onClose: () => void
  onOpenImage: (resource: NoteResource) => void
}) {
  function body(resource: NoteResource) {
    if (resource.kind === 'image') {
      return (
        <button type="button" className="note-image-button" onClick={() => onOpenImage(resource)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external manuscript scans, panned and zoomed rather than layout-sized */}
          <img className="note-image" src={resource.url} alt={resource.title} />
        </button>
      )
    }
    if (resource.embedUrl) {
      return <iframe title={resource.title} src={resource.embedUrl} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
    }
    return <a href={resource.url} target="_blank" rel="noreferrer">Open resource</a>
  }

  return (
    <Modal className="modal-backdrop" onClose={onClose} labelledBy="note-title">
      <section className="occurrence-modal note-modal">
        <header>
          <div>
            <span className="label">{note.provider}</span>
            <h2 id="note-title">{note.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close resource">×</button>
        </header>
        {note.resources
          ? (
              <div className="resource-group">
                {note.resources.map((resource) => (
                  <article key={resource.id}>
                    <h3>{resource.title}</h3>
                    {body(resource)}
                  </article>
                ))}
              </div>
            )
          : note.kind === 'image' || note.embedUrl
            ? body(note)
            : <p className="modal-status"><a href={note.url} target="_blank" rel="noreferrer">Open resource</a></p>}
      </section>
    </Modal>
  )
}

/** Full-bleed manuscript viewer supporting drag-to-pan. */
export function ImageViewer({ image, onClose }: { image: NoteResource; onClose: () => void }) {
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  function start(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const viewer = event.currentTarget
    drag.current = { x: event.clientX, y: event.clientY, left: viewer.scrollLeft, top: viewer.scrollTop }
    viewer.setPointerCapture(event.pointerId)
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current) return
    const viewer = event.currentTarget
    viewer.scrollLeft = current.left - (event.clientX - current.x)
    viewer.scrollTop = current.top - (event.clientY - current.y)
  }

  const stop = () => { drag.current = null }

  return (
    <Modal className="image-viewer-backdrop" onClose={onClose} label={image.title}>
      <section
        className="image-viewer"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      >
        <button type="button" className="image-viewer-close" onClick={onClose} aria-label="Close enlarged image">×</button>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external manuscript scans, panned and zoomed rather than layout-sized */}
        <img src={image.url} alt={image.title} draggable="false" />
      </section>
    </Modal>
  )
}

export function OccurrencesModal({
  entry,
  occurrences,
  total,
  truncated,
  loading,
  onClose,
  onOpenOccurrence,
}: {
  entry: LexiconEntry
  occurrences: Occurrence[]
  total: number
  truncated: boolean
  loading: boolean
  onClose: () => void
  onOpenOccurrence: (occurrence: Occurrence) => void
}) {
  return (
    <Modal className="modal-backdrop" onClose={onClose} labelledBy="occurrences-title">
      <section className="occurrence-modal">
        <header>
          <div>
            <span className="label">Occurrences</span>
            <h2 id="occurrences-title" lang="he">{entry.headword} <span>{entry.gloss}</span></h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close occurrences">×</button>
        </header>
        {loading
          ? <p className="modal-status">Loading all Bible occurrences...</p>
          : (
              <div className="occurrence-results modal-results">
                <strong>
                  {total} occurrence{total === 1 ? '' : 's'} in the Hebrew Bible
                  {truncated ? ` · showing the first ${occurrences.length}` : ''}
                </strong>
                {occurrences.map((occurrence) => (
                  <div key={`${occurrence.book}-${occurrence.chapter}-${occurrence.verse}`}>
                    <button type="button" className="occurrence-link" onClick={() => onOpenOccurrence(occurrence)}>
                      {occurrence.book} {occurrence.chapter}:{occurrence.verse}
                    </button>
                    <span dir="rtl" lang="he">{highlightWords(occurrence.hebrew, occurrence.words)}</span>
                    <p><bdi dir="ltr" className="occurrence-english">{occurrence.english}</bdi></p>
                  </div>
                ))}
              </div>
            )}
      </section>
    </Modal>
  )
}
