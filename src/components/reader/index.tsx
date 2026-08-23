'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { books, findBook, loadChapter, loadLexiconEntry, loadPlacesForLexicon, parseReference, type Book, type GeoPlace, type LexiconEntry, type Verse, type Word } from '@/data/tanakh'
import { ChapterResources } from './chapter-resources'
import { ContextBar, NavigationDrawer, ReaderToolbar, TopBar } from './chrome'
import { ImageViewer, NoteModal, OccurrencesModal } from './modals'
import { ParallelView, PassageView } from './passage'
import { ChapterPlaces } from './places-bar'
import { StudyPanel } from './study-panel'
import type { EnglishMode, NoteResource, Occurrence, PendingReference, TranslationId } from './types'
import { useAudio } from './use-audio'
import { useKaraoke } from './use-karaoke'
import { useNotes } from './use-notes'
import { useReadingPosition } from './use-reading-position'

export default function Reader() {
  const [book, setBook] = useState<Book>(books[0])
  const [chapter, setChapter] = useState(1)
  const [verses, setVerses] = useState<Verse[]>([])
  const [chapterLoading, setChapterLoading] = useState(true)

  const [selectedWord, setSelectedWord] = useState<Word | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<LexiconEntry | null>(null)
  const [selectedPlaces, setSelectedPlaces] = useState<GeoPlace[]>([])
  const [entryLoading, setEntryLoading] = useState(false)
  // Guards against a slow lexicon fetch resolving after a newer selection.
  const entryRequestRef = useRef(0)

  const [occurrencesOpen, setOccurrencesOpen] = useState(false)
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [occurrenceTotal, setOccurrenceTotal] = useState(0)
  const [occurrencesTruncated, setOccurrencesTruncated] = useState(false)
  const [occurrencesLoading, setOccurrencesLoading] = useState(false)
  const [pendingOccurrence, setPendingOccurrence] = useState<Occurrence | null>(null)

  const [pendingReference, setPendingReference] = useState<PendingReference | null>(null)
  const [referenceQuery, setReferenceQuery] = useState('')
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const [noteOpen, setNoteOpen] = useState<NoteResource | null>(null)
  const [imageOpen, setImageOpen] = useState<NoteResource | null>(null)

  const [englishMode, setEnglishMode] = useState<EnglishMode>('hidden')
  const [translation, setTranslation] = useState<TranslationId>('jps')

  const audio = useAudio(book.id, chapter)
  const { activeWordId, words } = useKaraoke(audio.frame, audio.nativeAudio, audio.open, audio.active, book.id, chapter)

  // Alignment order is identical to the chapter's word order (enforced by the
  // alignment data-shape tests), so each verse's start is the first word whose
  // alignment window begins. Used by the verse play icons.
  const verseStartById = useMemo(
    () => (words.length ? new Map(words.map((word) => [word.id, word.start])) : new Map<string, number>()),
    [words],
  )
  const verseStarts = useMemo(() => verses.reduce<Record<number, number>>((map, verse) => {
    const first = verse.words[0]?.id
    if (first && verseStartById.has(first)) map[verse.number] = verseStartById.get(first)!
    return map
  }, {}), [verses, verseStartById])
  const { chapterNotes, verseNotes, lemmaNotes, loadLemmaNotes } = useNotes(book.id, chapter)
  useReadingPosition(book, chapter, setBook, setChapter, setPendingReference)

  useEffect(() => {
    let active = true
    setChapterLoading(true)
    loadChapter(book.id, chapter, translation).then((loaded) => {
      if (active) {
        setVerses(loaded)
        setChapterLoading(false)
      }
    })
    return () => { active = false }
  }, [book.id, chapter, translation])

  const loadEntry = useCallback((id: string, request?: number) => {
    const guard = request ?? ++entryRequestRef.current
    setEntryLoading(true)
    void loadLexiconEntry(id).then((entry) => {
      if (entryRequestRef.current === guard) {
        setSelectedEntry(entry ?? null)
        setEntryLoading(false)
      }
    })
  }, [])

  const selectedLexicon = selectedEntry

  // Once the target chapter has loaded, select the word that was clicked in
  // the occurrences list and scroll it into view.
  useEffect(() => {
    if (!pendingOccurrence || !verses.length) return
    const targetVerse = verses.find((verse) => verse.number === pendingOccurrence.verse)
    const targetWord = targetVerse?.words.find((word) => word.lexiconId === selectedWord?.lexiconId)
    if (!targetVerse || !targetWord) return
    setSelectedWord(targetWord)
    if (targetWord.lexiconId) {
      const request = ++entryRequestRef.current
      loadEntry(targetWord.lexiconId, request)
      void loadPlacesForLexicon(targetWord.lexiconId).then((places) => {
        if (entryRequestRef.current === request) setSelectedPlaces(places)
      })
    }
    setPendingOccurrence(null)
    requestAnimationFrame(() => {
      document
        .getElementById(`verse-${pendingOccurrence.book}-${pendingOccurrence.chapter}-${pendingOccurrence.verse}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [verses, pendingOccurrence, selectedWord?.lexiconId, loadEntry])

  useEffect(() => {
    if (!pendingReference || !verses.length) return
    const targetVerse = pendingReference.verse
      ? verses.find((verse) => verse.number === pendingReference.verse)
      : undefined
    if (pendingReference.verse && !targetVerse) return
    setPendingReference(null)
    if (targetVerse) {
      requestAnimationFrame(() => {
        document
          .getElementById(`verse-${pendingReference.bookId}-${pendingReference.chapter}-${pendingReference.verse}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [verses, pendingReference])

  async function openOccurrences() {
    if (!selectedWord?.lexiconId) return
    setOccurrencesOpen(true)
    if (occurrences.length || occurrencesLoading) return
    setOccurrencesLoading(true)
    try {
      const response = await fetch(`/api/occurrences?lexiconId=${encodeURIComponent(selectedWord.lexiconId)}`)
      const data = await response.json() as { occurrences?: Occurrence[]; total?: number; truncated?: boolean }
      setOccurrences(data.occurrences ?? [])
      setOccurrenceTotal(data.total ?? data.occurrences?.length ?? 0)
      setOccurrencesTruncated(Boolean(data.truncated))
    } finally {
      setOccurrencesLoading(false)
    }
  }

  const selectWord = useCallback((word: Word) => {
    const request = ++entryRequestRef.current
    setSelectedWord(word)
    setSelectedEntry(null)
    setSelectedPlaces([])
    setOccurrencesOpen(false)
    setOccurrences([])
    void loadLemmaNotes(word.lexiconId)
    if (word.lexiconId) {
      loadEntry(word.lexiconId, request)
      void loadPlacesForLexicon(word.lexiconId).then((places) => {
        if (entryRequestRef.current === request) setSelectedPlaces(places)
      })
    } else setEntryLoading(false)
  }, [loadEntry, loadLemmaNotes])

  function goToBook(target: Book) {
    setBook(target)
    setChapter(1)
    setVerses([])
    setQuery('')
    setMenuOpen(false)
    setSelectedWord(null)
    setSelectedEntry(null)
    setSelectedPlaces([])
    setOccurrencesOpen(false)
  }

  function navigate(value: string) {
    const match = findBook(value)
    if (match) goToBook(match)
  }

  function navigateReference(value: string) {
    const parsed = parseReference(value)
    if (!parsed) return
    setBook(parsed.book)
    setChapter(parsed.chapter)
    setVerses([])
    setSelectedWord(null)
    setSelectedEntry(null)
    setSelectedPlaces([])
    setOccurrencesOpen(false)
    setPendingReference({ bookId: parsed.book.id, chapter: parsed.chapter, verse: parsed.verse })
    setReferenceQuery('')
  }

  function openOccurrence(occurrence: Occurrence) {
    // Occurrences always cite canonical book ids from the corpus.
    const target = books.find((item) => item.id === occurrence.book)
    if (!target) return
    setBook(target)
    setChapter(occurrence.chapter)
    setVerses([])
    setSelectedEntry(null)
    setPendingOccurrence(occurrence)
    setOccurrencesOpen(false)
  }

  function selectRelationship(relationship: NonNullable<LexiconEntry['lexicalRelationships']>[number]) {
    const inChapter = verses.flatMap((verse) => verse.words).find((word) => word.lexiconId === relationship.id)
    if (inChapter) {
      selectWord(inChapter)
      return
    }
    // The related lemma is absent from this chapter, so show the entry alone.
    const request = ++entryRequestRef.current
    setSelectedWord({
      id: relationship.id,
      text: relationship.headword,
      lemma: relationship.headword,
      morphology: '',
      morphologyLabel: 'Lexical relationship',
      lexiconId: relationship.id,
    })
    setSelectedEntry(null)
    setSelectedPlaces([])
    setOccurrences([])
    setOccurrencesOpen(false)
    void loadLemmaNotes(relationship.id)
    loadEntry(relationship.id, request)
    void loadPlacesForLexicon(relationship.id).then((places) => {
      if (entryRequestRef.current === request) setSelectedPlaces(places)
    })
  }

  const renderNoteButton = useCallback((note: NoteResource) => {
    const variant = note.title.startsWith('Manuscript') ? 'note-link manuscript-link' : 'note-link resource-link'
    return (
      <button key={note.id} type="button" className={variant} onClick={() => setNoteOpen(note)}>
        {note.title} ↗
      </button>
    )
  }, [])

  const passageProps = {
    book,
    chapter,
    verses,
    chapterLoading,
    translation,
    selectedWordId: selectedWord?.id,
    activeWordId,
    onSelectWord: selectWord,
    verseNotes,
    onOpenNote: setNoteOpen,
    verseStarts,
    onPlayFromVerse: (verseNumber: number) => {
      const start = verseStarts[verseNumber]
      if (start != null) audio.playFrom(start)
    },
  }

  return (
    <main className="app-shell">
      <TopBar
        referenceQuery={referenceQuery}
        setReferenceQuery={setReferenceQuery}
        onNavigateReference={navigateReference}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      {menuOpen && (
        <NavigationDrawer
          query={query}
          setQuery={setQuery}
          onNavigate={navigate}
          currentBookId={book.id}
          onSelectBook={goToBook}
        />
      )}

      <ContextBar book={book} chapter={chapter} setChapter={setChapter} />
      <ReaderToolbar
        englishMode={englishMode}
        setEnglishMode={setEnglishMode}
        translation={translation}
        setTranslation={setTranslation}
      />

      <ChapterResources chapterNotes={chapterNotes} renderNoteButton={renderNoteButton} audio={audio} />

      <ChapterPlaces bookId={book.id} chapter={chapter} />

      <section className={englishMode === 'parallel' ? 'reading-layout parallel' : 'reading-layout'}>
        {englishMode === 'parallel'
          ? <ParallelView {...passageProps} />
          : <PassageView {...passageProps} englishMode={englishMode} />}
        <StudyPanel
          word={selectedWord}
          entry={selectedLexicon ?? undefined}
          loading={entryLoading}
          lemmaNotes={lemmaNotes}
          places={selectedPlaces}
          renderNoteButton={renderNoteButton}
          onDismiss={() => {
            setSelectedWord(null)
            setSelectedEntry(null)
            setSelectedPlaces([])
          }}
          onOpenOccurrences={openOccurrences}
          onSelectRelationship={selectRelationship}
        />
      </section>

      {noteOpen && (
        <NoteModal note={noteOpen} onClose={() => setNoteOpen(null)} onOpenImage={setImageOpen} />
      )}
      {imageOpen && <ImageViewer image={imageOpen} onClose={() => setImageOpen(null)} />}
      {occurrencesOpen && selectedLexicon && (
        <OccurrencesModal
          entry={selectedLexicon}
          occurrences={occurrences}
          total={occurrenceTotal}
          truncated={occurrencesTruncated}
          loading={occurrencesLoading}
          onClose={() => setOccurrencesOpen(false)}
          onOpenOccurrence={openOccurrence}
        />
      )}

      <footer className="site-footer">
        <span>Open Hebrew Bible · a work in progress</span>
        <span>OSHB Hebrew Bible · Ezra SIL · source details</span>
      </footer>
    </main>
  )
}
