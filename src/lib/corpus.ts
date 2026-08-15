/**
 * Server-side data access for the pinned OSHB corpus.
 *
 * Every loader here memoises its parsed result at module scope. Next.js keeps
 * the module instance alive across requests, so a given artifact is read and
 * parsed once per server process rather than once per request.
 *
 * The promise itself is cached (not the resolved value) so that concurrent
 * requests arriving during a cold read share one file read instead of racing.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const generated = join(process.cwd(), 'data', 'generated')
const external = join(process.cwd(), 'data', 'external')
const kjvDir = join(process.cwd(), 'data', 'sources', 'kjv')

export type CorpusWord = {
  id: string
  text: string
  qere?: string
  lemma: string
  morphology: string
  morphologyLabel?: string
}

export type CorpusVerse = {
  number: number
  hebrew: string
  punctuation?: string
  english?: string
  englishReference?: string
  words: CorpusWord[]
}

export type BookChapters = Record<string, CorpusVerse[]>

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
  definition: string
  morphology: string
  partOfSpeech?: string[]
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

export type Lexicon = Record<string, LexiconEntry>
export type CitationMap = { jewishToChristian: Record<string, { book: string; chapter: number; verse: number }> }
/** entryId -> [bookId, chapter, verse][] */
export type OccurrenceIndex = Record<string, Array<[string, number, number]>>

export type ExternalResource = {
  id: string
  provider: string
  kind: string
  url: string
  embedUrl?: string
  title: string
  targets: string[]
  resources?: ExternalResource[]
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

/** Caches a loader's promise so repeated calls reuse one read. */
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined
  return () => {
    // Reset on failure so a transient error does not poison the process.
    cached ??= load().catch((error) => {
      cached = undefined
      throw error
    })
    return cached
  }
}

/** Caches per-key, e.g. one entry per book file. */
function memoizeByKey<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (key: string) => {
    let existing = cache.get(key)
    if (!existing) {
      existing = load(key).catch((error) => {
        cache.delete(key)
        throw error
      })
      cache.set(key, existing)
    }
    return existing
  }
}

/** Loads a single book's chapters (~1-4 MB) rather than the whole corpus. */
export const getBook = memoizeByKey<BookChapters>((bookId) =>
  readJson<BookChapters>(join(generated, 'books', `${bookId}.json`)),
)

export const getLexicon = memoize(() => readJson<Lexicon>(join(generated, 'oshb-lexicon.json')))

export const getCitationMap = memoize(() =>
  readJson<CitationMap>(join(generated, 'jewish-to-christian-citation-map.json')),
)

export const getOccurrenceIndex = memoize(() =>
  readJson<OccurrenceIndex>(join(generated, 'occurrence-index.json')),
)

export const getExternalCatalog = memoizeByKey<{ resources: ExternalResource[] }>((name) =>
  readJson<{ resources: ExternalResource[] }>(join(external, name)),
)

type KjvBook = { book: string; chapters: Array<{ chapter: string; verses: Array<{ verse: string; text: string }> }> }

/**
 * KJV text keyed as `"<chapter>:<verse>" -> text`, read from the local
 * `data/sources/kjv` files rather than a third-party CDN.
 */
export const getKjvBook = memoizeByKey<Map<string, string>>(async (fileName) => {
  const book = await readJson<KjvBook>(join(kjvDir, `${fileName}.json`))
  const byVerse = new Map<string, string>()
  for (const chapter of book.chapters) {
    for (const verse of chapter.verses) byVerse.set(`${chapter.chapter}:${verse.verse}`, verse.text)
  }
  return byVerse
})

/**
 * Resolves an OSHB lemma to its lexicon key. Lemmas may carry prefixes
 * separated by `/` (e.g. `b/7225`); the lexicon is keyed on the final
 * segment, lowercased and stripped of spaces.
 */
export function lemmaKey(lemma: string) {
  return (lemma.split('/').at(-1) ?? lemma).replaceAll(' ', '').toLowerCase()
}
