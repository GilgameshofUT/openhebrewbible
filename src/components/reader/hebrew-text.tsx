'use client'

import { DIVINE_NAME_CLOSE, DIVINE_NAME_OPEN, normalizeTranslation } from '@/lib/text'
import type { Verse, Word } from '@/data/tanakh'
import type { NoteResource } from './types'

/** Accessible name for a word: lemma and parse, plus the qere when present. */
export function wordLabel(word: Word) {
  return word.qere
    ? `${word.lemma}, ${word.morphologyLabel}; qere ${word.qere}`
    : `${word.lemma}, ${word.morphologyLabel}`
}

export function wordClass(word: Word, selected: boolean) {
  return `${selected ? 'word selected-word' : 'word'}${word.qere ? ' has-qere' : ''}`
}

/**
 * Renders the clickable Hebrew of a verse followed by its sof pasuq.
 *
 * `data-qere` carries the read form for the CSS tooltip. It is deliberately
 * separate from `aria-label`: coupling the two caused the tooltip to break
 * every time the accessible name was reworded.
 */
export function HebrewVerse({
  verse,
  selectedWordId,
  onSelectWord,
  notes,
  onOpenNote,
}: {
  verse: Verse
  selectedWordId: string | undefined
  onSelectWord: (word: Word) => void
  notes: NoteResource[] | undefined
  onOpenNote: (note: NoteResource) => void
}) {
  if (!verse.words.length) return <>{verse.hebrew}</>
  return (
    <>
      {verse.words.map((word) => (
        <button
          key={word.id}
          className={wordClass(word, selectedWordId === word.id)}
          data-qere={word.qere}
          onClick={() => onSelectWord(word)}
          aria-label={wordLabel(word)}
        >
          {word.text}
        </button>
      ))}
      <span className="verse-end-mark" aria-label="sof pasuq">׃</span>
      {notes?.map((note) => (
        <span key={note.id}>
          <button type="button" className="note-link" onClick={() => onOpenNote(note)}>Note ↗</button>
        </span>
      ))}
    </>
  )
}

/** Renders translation markup, preserving paragraphs, line breaks, and small caps. */
export function Translation({ text }: { text: string }) {
  const normalized = normalizeTranslation(text)
  return (
    <>
      {normalized.split(/\n\n+/).map((paragraph, paragraphIndex) => (
        <span className="translation-paragraph" key={`paragraph-${paragraphIndex}`}>
          {paragraph.split('\n').map((line, lineIndex) => (
            <span className="translation-line" key={`line-${lineIndex}`}>
              {lineIndex ? <br /> : null}
              {line.split(/({{DIVINE_NAME}}.*?{{\/DIVINE_NAME}})/g).map((part, partIndex) =>
                part.startsWith(DIVINE_NAME_OPEN)
                  ? (
                      <span className="divine-name" key={partIndex}>
                        {part.replace(DIVINE_NAME_OPEN, '').replace(DIVINE_NAME_CLOSE, '')}
                      </span>
                    )
                  : <span key={partIndex}>{part}</span>,
              )}
            </span>
          ))}
        </span>
      ))}
    </>
  )
}

/** Highlights each matched word inside an occurrence snippet. */
export function highlightWords(text: string, words: string[]) {
  const unique = [...new Set(words)].filter(Boolean)
  if (!unique.length) return text
  const pattern = new RegExp(`(${unique.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return text.split(pattern).map((part, index) => unique.includes(part)
    ? <mark key={`${part}-${index}`}>{part}</mark>
    : <span key={`${part}-${index}`}>{part}</span>)
}
