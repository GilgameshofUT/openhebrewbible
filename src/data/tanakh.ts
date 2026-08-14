/**
 * Client-facing view of the corpus.
 *
 * Book identity and reference parsing live in `@/lib/books` so the API routes
 * can validate against exactly the same list the reader navigates by.
 */
export { books, findBook, parseReference, getBookById, type Book, type Division, type ParsedReference } from '@/lib/books'

/**
 * A BDB sense. Verb entries group senses by verbal stem (Qal, Niph., Hiph.),
 * and each stem may hold numbered and lettered sub-senses, so this is a tree.
 */
export type LexiconSense = {
  number?: string
  stem?: string
  text: string
  references: string[]
  senses?: LexiconSense[]
}

export type LexiconEntry = {
  id: string
  headword: string
  transliteration: string
  gloss: string
  morphology: string
  partOfSpeech?: string[]
  definition: string
  senses?: LexiconSense[]
  strongs?: string
  twot?: string
  lexicalIndexId?: string
  bdbId?: string
  bdbRoot?: string
  etymology?: string
  lexicalRelationships?: Array<{ id: string; headword: string; transliteration: string; gloss: string }>
  bdbStatus?: string
  references: string[]
}

export type Word = {
  id: string
  text: string
  qere?: string
  lemma: string
  morphology: string
  morphologyLabel: string
  lexiconId: string
  lexicon?: LexiconEntry
}

export type Verse = {
  number: number
  hebrew: string
  english: string
  words: Word[]
  punctuation?: string
  note?: string
  englishReference?: string
}

type ChapterResponse = {
  verses: Array<{
    number: number
    hebrew: string
    punctuation?: string
    english?: string
    englishReference?: string
    words: Array<{
      id: string
      text: string
      qere?: string
      lemma: string
      morphology: string
      morphologyLabel?: string
      lexiconId?: string | null
      lexicon?: LexiconEntry | null
    }>
  }>
}

export async function loadChapter(bookId: string, chapter: number, translation: 'jps' | 'kjv'): Promise<Verse[]> {
  const response = await fetch(`/api/chapter?book=${encodeURIComponent(bookId)}&chapter=${chapter}&translation=${translation}`)
  if (!response.ok) return []
  const data = await response.json() as ChapterResponse
  return data.verses.map((verse) => ({
    ...verse,
    english: verse.english ?? '',
    englishReference: verse.englishReference,
    words: verse.words.map((word) => ({
      ...word,
      morphologyLabel: word.morphologyLabel ?? word.morphology,
      lexiconId: word.lexiconId ?? '',
      lexicon: word.lexicon ?? undefined,
    })),
  }))
}
