'use client'

import { useEffect, useState } from 'react'
import { books, findBook, loadChapter, parseReference, type Book, type LexiconEntry, type Verse, type Word } from '@/data/tanakh'
import { ChapterResources } from './chapter-resources'
import { ContextBar, NavigationDrawer, ReaderToolbar, TopBar } from './chrome'
import { ImageViewer, NoteModal, OccurrencesModal } from './modals'
import { ParallelView, PassageView } from './passage'
import { StudyPanel } from './study-panel'
import type { EnglishMode, NoteResource, Occurrence, PendingReference, TranslationId } from './types'
import { useAudio } from './use-audio'
import { useNotes } from './use-notes'
import { useReadingPosition } from './use-reading-position'

export default function Reader() {
  const [book, setBook] = useState<Book>(books[0])
  const [chapter, setChapter] = useState(1)
  const [verses, setVerses] = useState<Verse[]>([])

  const [selectedWord, setSelectedWord] = useState<Word | null>(null)
  const [relatedLexicon, setRelatedLexicon] = useState<LexiconEntry | null>(null)

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
  const { chapterNotes, verseNotes, lemmaNotes, loadLemmaNotes } = useNotes(book.id, chapter)
  useReadingPosition(book, chapter, setBook, setChapter, setPendingReference)

  useEffect(() => {
    let active = true
    loadChapter(book.id, chapter, translation).then((loaded) => { if (active) setVerses(loaded) })
    return () => { active = false }
  }, [book.id, chapter, translation])

  const selectedLexicon = relatedLexicon ?? selectedWord?.lexicon

  // Once the target chapter has loaded, select the word that was clicked in
  // the occurrences list and scroll it into view.
  useEffect(() => {
    if (!pendingOccurrence || !verses.length) return
    const targetVerse = verses.find((verse) => verse.number === pendingOccurrence.verse)
    const targetWord = targetVerse?.words.find((word) => word.lexiconId === selectedWord?.lexiconId)
    if (!targetVerse || !targetWord) return
    setSelectedWord(targetWord)
    setPendingOccurrence(null)
    requestAnimationFrame(() => {
      document
        .getElementById(`verse-${pendingOccurrence.book}-${pendingOccurrence.chapter}-${pendingOccurrence.verse}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [verses, pendingOccurrence, selectedWord?.lexiconId])

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

  function selectWord(word: Word) {
    setSelectedWord(word)
    setRelatedLexicon(null)
    setOccurrencesOpen(false)
    setOccurrences([])
    void loadLemmaNotes(word.lexiconId)
  }

  function goToBook(target: Book) {
    setBook(target)
    setChapter(1)
    setVerses([])
    setQuery('')
    setMenuOpen(false)
    setSelectedWord(null)
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
    setRelatedLexicon({
      id: relationship.id,
      headword: relationship.headword,
      transliteration: relationship.transliteration,
      gloss: relationship.gloss,
      morphology: '',
      definition: relationship.gloss,
      references: [],
    })
    setSelectedWord({
      id: relationship.id,
      text: relationship.headword,
      lemma: relationship.headword,
      morphology: '',
      morphologyLabel: 'Lexical relationship',
      lexiconId: relationship.id,
    })
    setOccurrences([])
    setOccurrencesOpen(false)
  }

  function renderNoteButton(note: NoteResource) {
    const variant = note.title.startsWith('Manuscript') ? 'note-link manuscript-link' : 'note-link resource-link'
    return (
      <button key={note.id} type="button" className={variant} onClick={() => setNoteOpen(note)}>
        {note.title} ↗
      </button>
    )
  }

  const passageProps = {
    book,
    chapter,
    verses,
    translation,
    selectedWordId: selectedWord?.id,
    onSelectWord: selectWord,
    verseNotes,
    onOpenNote: setNoteOpen,
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

      <section className={englishMode === 'parallel' ? 'reading-layout parallel' : 'reading-layout'}>
        {englishMode === 'parallel'
          ? <ParallelView {...passageProps} />
          : <PassageView {...passageProps} englishMode={englishMode} />}
        <StudyPanel
          word={selectedWord}
          entry={selectedLexicon}
          lemmaNotes={lemmaNotes}
          renderNoteButton={renderNoteButton}
          onDismiss={() => setSelectedWord(null)}
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

      <footer id="about" className="site-footer">
        <span>Web Tanakh · a work in progress</span>
        <span>OSHB Hebrew Bible · Ezra SIL · source details</span>
      </footer>
    </main>
  )
}
