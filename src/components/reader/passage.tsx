'use client'

import type { Book, Verse, Word } from '@/data/tanakh'
import { HebrewVerse, Translation } from './hebrew-text'
import { translationLabel, translationShortLabel } from '@/lib/translations'
import type { EnglishMode, NoteResource, TranslationId } from './types'

type SharedProps = {
  book: Book
  chapter: number
  verses: Verse[]
  translation: TranslationId
  selectedWordId: string | undefined
  onSelectWord: (word: Word) => void
  verseNotes: Record<string, NoteResource[]>
  onOpenNote: (note: NoteResource) => void
}

function EmptyChapter() {
  return (
    <div className="empty-chapter">
      <strong>This chapter is ready for corpus import.</strong>
      <p>The complete navigation is in place. Run the OSHB importer to populate this chapter with the pinned source data.</p>
      <code>npm run import:oshb && npm run build:derived</code>
    </div>
  )
}

/** Single-column Hebrew reading view, optionally with English beneath. */
export function PassageView({
  book, chapter, verses, translation, selectedWordId, onSelectWord, verseNotes, onOpenNote, englishMode,
}: SharedProps & { englishMode: EnglishMode }) {
  return (
    <article className="passage" aria-label={`${book.name} chapter ${chapter}`}>
      <div className="passage-heading">
        <span>Hebrew text</span>
        <span className="source-chip">OSHB · WLC</span>
      </div>
      {verses.length === 0 ? <EmptyChapter /> : verses.map((verse) => (
        <div className="verse" id={`verse-${book.id}-${chapter}-${verse.number}`} key={verse.number}>
          <div className="verse-number">{verse.number}</div>
          <div className="verse-body">
            <div className="hebrew" lang="he" dir="rtl">
              <HebrewVerse
                verse={verse}
                selectedWordId={selectedWordId}
                onSelectWord={onSelectWord}
                notes={verseNotes[String(verse.number)]}
                onOpenNote={onOpenNote}
              />
            </div>
            {englishMode === 'beneath' && (
              <div className="english">
                <span className="translation-tag">
                  {translationShortLabel(translation)}{verse.englishReference ? ` · ${verse.englishReference}` : ''}
                </span>
                <Translation text={verse.english} />
              </div>
            )}
            {verse.note && <div className="verse-note"><span>NOTE</span>{verse.note}</div>}
          </div>
        </div>
      ))}
    </article>
  )
}

/** Two-column Hebrew and English view. */
export function ParallelView({
  book, chapter, verses, translation, selectedWordId, onSelectWord, verseNotes, onOpenNote,
}: SharedProps) {
  return (
    <div className="parallel-table" aria-label={`${book.name} chapter ${chapter} parallel text`}>
      <div className="parallel-table-heading">
        <div>Hebrew text <span className="source-chip">OSHB · WLC</span></div>
        <div>English text <span className="source-chip">{translationLabel(translation)}</span></div>
      </div>
      {verses.map((verse) => (
        <div className="parallel-row" id={`verse-${book.id}-${chapter}-${verse.number}`} key={verse.number}>
          <div className="parallel-hebrew">
            <div className="verse-number">{verse.number}</div>
            <div className="hebrew" lang="he" dir="rtl">
              <HebrewVerse
                verse={verse}
                selectedWordId={selectedWordId}
                onSelectWord={onSelectWord}
                notes={verseNotes[String(verse.number)]}
                onOpenNote={onOpenNote}
              />
            </div>
          </div>
          <div className="parallel-english-cell">
            <div className="verse-number">{verse.number}</div>
            <p>
              {verse.englishReference ? <small>{verse.englishReference}</small> : null}
              <Translation text={verse.english} />
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
