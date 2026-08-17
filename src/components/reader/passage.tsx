'use client'

import type { Book, Verse, Word } from '@/data/tanakh'
import { HebrewVerse, Translation } from './hebrew-text'
import { translationLabel, translationShortLabel } from '@/lib/translations'
import type { EnglishMode, NoteResource, TranslationId } from './types'

type SharedProps = {
  book: Book
  chapter: number
  verses: Verse[]
  chapterLoading: boolean
  translation: TranslationId
  selectedWordId: string | undefined
  activeWordId: string | undefined
  onSelectWord: (word: Word) => void
  verseNotes: Record<string, NoteResource[]>
  onOpenNote: (note: NoteResource) => void
  verseStarts: Record<number, number>
  onPlayFromVerse: (verseNumber: number) => void
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

/** Shown while a chapter fetch is in flight so the empty state never flashes. */
function ChapterLoading() {
  return <div className="chapter-loading" aria-live="polite">Loading chapter…</div>
}

/** A small play button next to a verse number that starts audio at that verse. */
function VersePlayButton({ verse, verseStarts, onPlayFromVerse }: { verse: Verse; verseStarts: Record<number, number>; onPlayFromVerse: (n: number) => void }) {
  const start = verseStarts[verse.number]
  if (start == null) return null
  return (
    <button
      type="button"
      className="verse-play"
      onClick={(event) => { event.stopPropagation(); onPlayFromVerse(verse.number) }}
      aria-label={`Play verse ${verse.number}`}
      title="Play audio from this verse"
    >
      ▶
    </button>
  )
}

/** Single-column Hebrew reading view, optionally with English beneath. */
export function PassageView({
  book, chapter, verses, chapterLoading, translation, selectedWordId, activeWordId, onSelectWord, verseNotes, onOpenNote, englishMode, verseStarts, onPlayFromVerse,
}: SharedProps & { englishMode: EnglishMode }) {
  return (
    <article className="passage" aria-label={`${book.name} chapter ${chapter}`}>
      <div className="passage-heading">
        <span>Hebrew text</span>
        <span className="source-chip">OSHB · WLC</span>
      </div>
      {verses.length === 0
        ? chapterLoading ? <ChapterLoading /> : <EmptyChapter />
        : verses.map((verse) => (
        <div className="verse" id={`verse-${book.id}-${chapter}-${verse.number}`} key={verse.number}>
          <div className="verse-number">
            {verse.number}
            <VersePlayButton verse={verse} verseStarts={verseStarts} onPlayFromVerse={onPlayFromVerse} />
          </div>
          <div className="verse-body">
            <div className="hebrew" lang="he" dir="rtl">
              <HebrewVerse
                verse={verse}
                selectedWordId={selectedWordId}
                activeWordId={activeWordId}
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
  book, chapter, verses, chapterLoading, translation, selectedWordId, activeWordId, onSelectWord, verseNotes, onOpenNote, verseStarts, onPlayFromVerse,
}: SharedProps) {
  return (
    <div className="parallel-table" aria-label={`${book.name} chapter ${chapter} parallel text`}>
      <div className="parallel-table-heading">
        <div>Hebrew text <span className="source-chip">OSHB · WLC</span></div>
        <div>English text <span className="source-chip">{translationLabel(translation)}</span></div>
      </div>
      {verses.length === 0 && chapterLoading ? <ChapterLoading /> : verses.map((verse) => (
        <div className="parallel-row" id={`verse-${book.id}-${chapter}-${verse.number}`} key={verse.number}>
          <div className="parallel-hebrew">
            <div className="verse-number">
              {verse.number}
              <VersePlayButton verse={verse} verseStarts={verseStarts} onPlayFromVerse={onPlayFromVerse} />
            </div>
            <div className="hebrew" lang="he" dir="rtl">
              <HebrewVerse
                verse={verse}
                selectedWordId={selectedWordId}
                activeWordId={activeWordId}
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
