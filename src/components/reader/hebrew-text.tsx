'use client'

import { memo } from 'react'
import { DIVINE_NAME_CLOSE, DIVINE_NAME_OPEN, normalizeTranslation } from '@/lib/text'
import type { Verse, Word } from '@/data/tanakh'
import type { NoteResource } from './types'

/** Accessible name for a word: lemma and parse, plus the qere when present. */
export function wordLabel(word: Word) {
  return word.qere
    ? `${word.lemma}, ${word.morphologyLabel}; qere ${word.qere}`
    : `${word.lemma}, ${word.morphologyLabel}`
}

export function wordClass(word: Word, selected: boolean, active: boolean) {
  return `${selected ? 'word selected-word' : 'word'}${active ? ' active-word' : ''}${word.qere ? ' has-qere' : ''}`
}

const NOTE_KIND_EMOJI: Record<string, string> = {
  text: '📝',
  article: '🎓',
  video: '🎬',
}

const NOTE_KIND_LABEL: Record<string, string> = {
  text: 'text note',
  article: 'article',
  video: 'video',
}

/** Kinds are indicated in the same order the notes API groups them. */
const NOTE_KIND_ORDER = ['text', 'article', 'video'] as const

/** The resources a note link represents, unwrapping the single group node. */
function noteMembers(note: NoteResource): NoteResource[] {
  return note.kind === 'group' && note.resources?.length ? note.resources : [note]
}

/** One emoji per distinct kind, deduplicated, in NOTE_KIND_ORDER. */
export function noteKindEmoji(note: NoteResource): string {
  const kinds = new Set(noteMembers(note).map((member) => member.kind))
  return NOTE_KIND_ORDER.filter((kind) => kinds.has(kind)).map((kind) => NOTE_KIND_EMOJI[kind]).join('')
}

/** Human-readable kinds for the accessible name, in the same order. */
export function noteKindLabel(note: NoteResource): string {
  const kinds = new Set(noteMembers(note).map((member) => member.kind))
  const label = NOTE_KIND_ORDER.filter((kind) => kinds.has(kind)).map((kind) => NOTE_KIND_LABEL[kind]).join(', ')
  return label ? `Notes: ${label}` : 'Notes'
}

/**
 * Renders the clickable Hebrew of a verse followed by its sof pasuq.
 *
 * `data-qere` carries the read form for the CSS tooltip. It is deliberately
 * separate from `aria-label`: coupling the two caused the tooltip to break
 * every time the accessible name was reworded.
 */
export const HebrewVerse = memo(function HebrewVerse({
  verse,
  selectedWordId,
  activeWordId,
  onSelectWord,
  notes,
  onOpenNote,
}: {
  verse: Verse
  selectedWordId: string | undefined
  activeWordId: string | undefined
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
          className={wordClass(word, selectedWordId === word.id, activeWordId === word.id)}
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
          <button
            type="button"
            className="note-link"
            onClick={() => onOpenNote(note)}
            aria-label={noteKindLabel(note)}
            title={noteKindLabel(note)}
          >
            Notes <span aria-hidden="true">{noteKindEmoji(note)}</span>
          </button>
        </span>
      ))}
    </>
  )
})

/** Renders translation markup, preserving paragraphs, line breaks, and small caps. */
export const Translation = memo(function Translation({ text }: { text: string }) {
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
})

/** Highlights each matched word inside an occurrence snippet. */
export function highlightWords(text: string, words: string[]) {
  const unique = [...new Set(words)].filter(Boolean)
  if (!unique.length) return text
  const pattern = new RegExp(`(${unique.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return text.split(pattern).map((part, index) => unique.includes(part)
    ? <mark key={`${part}-${index}`}>{part}</mark>
    : <span key={`${part}-${index}`}>{part}</span>)
}
