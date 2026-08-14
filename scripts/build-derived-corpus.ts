/**
 * Derives the runtime-facing corpus artifacts from the pinned OSHB import.
 *
 * The reader only ever needs one chapter or one lemma at a time, but
 * `oshb-corpus.json` is a single 51 MB document. Reading it per request costs
 * roughly 250 ms and 216 MB of heap churn. This script splits it into
 * per-book files and precomputes a lemma occurrence index so a request can
 * touch ~1 MB instead of the whole Bible.
 *
 * Inputs (produced by `npm run import:oshb`):
 *   data/generated/oshb-corpus.json
 *   data/generated/oshb-lexicon.json
 *
 * Outputs:
 *   data/generated/books/<bookId>.json
 *   data/generated/occurrence-index.json
 *   data/generated/derived-manifest.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const generated = join(root, 'data', 'generated')
const booksDir = join(generated, 'books')

type CorpusWord = { id: string; text: string; qere?: string; lemma: string; morphology: string; morphologyLabel?: string }
type CorpusVerse = { number: number; hebrew: string; punctuation?: string; english?: string; words: CorpusWord[] }
type Corpus = Record<string, Record<string, CorpusVerse[]>>
type Lexicon = Record<string, { id: string }>

/**
 * Normalises an OSHB lemma to its lexicon key. Lemmas may carry prefixes
 * separated by `/` (e.g. `b/7225`); the lexicon is keyed on the final
 * segment, lowercased and stripped of spaces.
 */
export function lemmaKey(lemma: string) {
  return (lemma.split('/').at(-1) ?? lemma).replaceAll(' ', '').toLowerCase()
}

async function main() {
  const [corpusRaw, lexiconRaw] = await Promise.all([
    readFile(join(generated, 'oshb-corpus.json'), 'utf8'),
    readFile(join(generated, 'oshb-lexicon.json'), 'utf8'),
  ])
  const corpus = JSON.parse(corpusRaw) as Corpus
  const lexicon = JSON.parse(lexiconRaw) as Lexicon

  await mkdir(booksDir, { recursive: true })

  // Map each lexicon key to its canonical entry id once, so the occurrence
  // walk below is a single hash lookup per word rather than a scan.
  const keyToEntryId = new Map<string, string>()
  for (const [key, entry] of Object.entries(lexicon)) keyToEntryId.set(key, entry.id)

  const occurrenceIndex: Record<string, Array<[string, number, number]>> = {}
  let verseCount = 0
  let wordCount = 0

  for (const [bookId, chapters] of Object.entries(corpus)) {
    await writeFile(join(booksDir, `${bookId}.json`), JSON.stringify(chapters))

    for (const [chapter, verses] of Object.entries(chapters)) {
      const chapterNumber = Number(chapter)
      for (const verse of verses) {
        verseCount += 1
        // A lemma may repeat inside one verse; record the verse once per lemma.
        const seen = new Set<string>()
        for (const word of verse.words) {
          wordCount += 1
          const entryId = keyToEntryId.get(lemmaKey(word.lemma))
          if (!entryId || seen.has(entryId)) continue
          seen.add(entryId)
          ;(occurrenceIndex[entryId] ??= []).push([bookId, chapterNumber, verse.number])
        }
      }
    }
  }

  await writeFile(join(generated, 'occurrence-index.json'), JSON.stringify(occurrenceIndex))

  const derivedManifest = {
    status: 'derived',
    from: 'oshb-corpus.json',
    books: Object.keys(corpus).length,
    verses: verseCount,
    words: wordCount,
    indexedLemmas: Object.keys(occurrenceIndex).length,
  }
  await writeFile(join(generated, 'derived-manifest.json'), JSON.stringify(derivedManifest, null, 2) + '\n')

  console.log(`Split ${derivedManifest.books} books and indexed ${derivedManifest.indexedLemmas} lemmas across ${verseCount} verses.`)
}

void main()
