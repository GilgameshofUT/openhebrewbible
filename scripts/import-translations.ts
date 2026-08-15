/**
 * Imports additional English translations and converts them to Jewish
 * versification so the reader can join any of them to the canonical corpus
 * without runtime conversion.
 *
 * Christian-system editions (WEB, YLT, BSB) are re-keyed through the inverse
 * of jewish-to-christian-citation-map.json: each source verse is placed at
 * every Jewish verse that maps to it. This matches the reader's existing KJV
 * behaviour exactly — e.g. Christian Ps 22:1 feeds both Jewish Ps 22:1 and
 * 22:2, since the Jewish system numbers the superscription as verse 1.
 *
 * Sefaria Community Translation already uses Jewish versification, so it is
 * only aligned to the corpus verse list; books Sefaria has not translated
 * are skipped, and untranslated verses become empty strings.
 *
 * Output is written as committed source data under data/sources/<id>/ so
 * conversion mistakes can be fixed by hand rather than by re-running this
 * script. The Docker build copies these files verbatim; it does not re-run
 * the fetch.
 *
 * Prerequisite: `npm run import:citations` (the conversion reads the
 * citation map). Then `npm run build:derived` is not affected — translation
 * files are read directly at request time.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { books } from '../src/lib/books'
import { citationAbbrevs } from './shared-books'

const root = process.cwd()
const generated = join(root, 'data', 'generated')
const outputRoot = join(root, 'data', 'sources')

// Pinned upstream sources so a regeneration is reproducible. The Sefaria
// export bucket has no commit to pin; its files are recorded in the output
// and drift is caught by git diff on the committed translation files.
const PINNED = {
  scrollmapper: 'e1b254cef86d0e65b1a5d1a94b8b112d0f296a2c',
  web: '68669ba3be9719ae4d1135b19d9e0b6587b7c356',
} as const

type Corpus = Record<string, Record<string, Array<{ number: number }>>>
type JewishKey = string // "bookId:chapter:verse"
type JewishTarget = { bookId: string; chapter: number; verse: number }

/** Normalises a book name so any edition's spelling finds our book id. */
function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/^i\s+/, '1 ')
    .replace(/^ii\s+/, '2 ')
    .replace(/^iii\s+/, '3 ')
    .replace(/[^a-z0-9]/g, '')
}

const booksBySourceName = new Map<string, string>()
for (const book of books) {
  for (const candidate of [book.name, book.kjvFile]) booksBySourceName.set(normalizeName(candidate), book.id)
}

/** Cleans edition markup and whitespace while preserving poetic line breaks. */
function cleanText(value: string) {
  return value
    .replace(/<sup[^>]*>.*?<\/sup>/gi, '')
    .replace(/<i[^>]*>.*?<\/i>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ +$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Christian "abbrev:chapter:verse" -> every Jewish verse that maps to it. */
function buildReverseMap(citationMap: { jewishToChristian: Record<JewishKey, { book: string; chapter: number; verse: number }> }) {
  const reverse = new Map<string, JewishTarget[]>()
  for (const [jewishKey, ref] of Object.entries(citationMap.jewishToChristian)) {
    const [bookId, chapter, verse] = jewishKey.split(':')
    const christianKey = `${ref.book}:${ref.chapter}:${ref.verse}`
    const targets = reverse.get(christianKey) ?? []
    targets.push({ bookId, chapter: Number(chapter), verse: Number(verse) })
    reverse.set(christianKey, targets)
  }
  return reverse
}

/** Fills every corpus verse from a source map, emitting the KJV file shape. */
async function emitTranslation(
  id: string,
  sourceTexts: Map<JewishKey, string>,
  corpus: Corpus,
  sources: string[],
): Promise<{ total: number; covered: number; emptyBooks: string[] }> {
  const outputDir = join(outputRoot, id)
  await mkdir(outputDir, { recursive: true })
  let total = 0
  let covered = 0
  const emptyBooks: string[] = []

  for (const book of books) {
    const chapters = corpus[book.id]
    if (!chapters) continue
    const chaptersOut: Array<{ chapter: string; verses: Array<{ verse: string; text: string }> }> = []
    let bookCovered = 0
    for (const [chapter, verses] of Object.entries(chapters)) {
      const versesOut = verses.map((verse) => {
        const text = sourceTexts.get(`${book.id}:${chapter}:${verse.number}`) ?? ''
        total += 1
        if (text) covered += 1
        if (text) bookCovered += 1
        return { verse: String(verse.number), text }
      })
      chaptersOut.push({ chapter, verses: versesOut })
    }
    if (bookCovered === 0) {
      emptyBooks.push(book.id)
      continue
    }
    await writeFile(join(outputDir, `${book.kjvFile}.json`), `${JSON.stringify({ book: book.name, chapters: chaptersOut })}\n`)
  }

  console.log(`  ${id}: ${covered}/${total} verses covered${emptyBooks.length ? `; no text: ${emptyBooks.join(', ')}` : ''}`)
  console.log(`  sources: ${sources.join(', ')}`)
  return { total, covered, emptyBooks }
}

// --------------------------------------------------------------------- WEB
// TehShrike/world-english-bible: one JSON file per book, a flat array of
// typed objects. Poetic verses are `line text` fragments separated by
// `line break` objects; joining fragments of one verse with "\n" preserves
// the line structure the way the JPS importer does.
type WebItem = { type: string; chapterNumber?: number; verseNumber?: number; value?: string }

async function importWeb(corpus: Corpus, reverse: Map<string, JewishTarget[]>) {
  const sourceTexts = new Map<JewishKey, string>()
  const sources: string[] = []
  let unmapped = 0

  for (const book of books) {
    const file = `${normalizeName(book.kjvFile)}.json`
    const url = `https://raw.githubusercontent.com/TehShrike/world-english-bible/${PINNED.web}/json/${file}`
    sources.push(url)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`WEB fetch failed: ${file} -> ${response.status}`)
    const items = (await response.json()) as WebItem[]

    const sourceVerses = new Map<string, string>()
    for (const item of items) {
      if (item.type !== 'paragraph text' && item.type !== 'line text') continue
      if (item.chapterNumber === undefined || item.verseNumber === undefined) continue
      const fragment = cleanText(item.value ?? '')
      if (!fragment) continue
      const key = `${item.chapterNumber}:${item.verseNumber}`
      sourceVerses.set(key, sourceVerses.has(key) ? `${sourceVerses.get(key)}\n${fragment}` : fragment)
    }

    const abbrev = citationAbbrevs.get(book.id)
    for (const [key, text] of sourceVerses) {
      const targets = reverse.get(`${abbrev}:${key}`)
      if (!targets) {
        unmapped += 1
        continue
      }
      for (const target of targets) sourceTexts.set(`${target.bookId}:${target.chapter}:${target.verse}`, text)
    }
  }

  if (unmapped) console.log(`  WEB: ${unmapped} source verses had no Jewish target; dropped`)
  await emitTranslation('web', sourceTexts, corpus, sources)
}

// -------------------------------------------------------------- YLT and BSB
// scrollmapper/bible_databases: one JSON file per translation with
// `{ translation, books: [{ name, chapters: [{ chapter, verses: [...] }] }] }`.
type ScrollBook = {
  translation: string
  books: Array<{ name: string; chapters: Array<{ chapter: number; verses: Array<{ verse: number; text: string }> }> }>
}

async function importScrollmapper(id: 'ylt' | 'bsb', corpus: Corpus, reverse: Map<string, JewishTarget[]>) {
  const file = id === 'ylt' ? 'YLT.json' : 'BSB.json'
  const url = `https://raw.githubusercontent.com/scrollmapper/bible_databases/${PINNED.scrollmapper}/formats/json/${file}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${id} fetch failed: ${response.status}`)
  const data = (await response.json()) as ScrollBook

  const sourceTexts = new Map<JewishKey, string>()
  let unmapped = 0

  for (const sourceBook of data.books) {
    const bookId = booksBySourceName.get(normalizeName(sourceBook.name))
    if (!bookId) continue // New Testament books are out of scope.
    const abbrev = citationAbbrevs.get(bookId)
    for (const chapter of sourceBook.chapters) {
      for (const verse of chapter.verses) {
        const text = cleanText(verse.text)
        if (!text) continue
        const targets = reverse.get(`${abbrev}:${chapter.chapter}:${verse.verse}`)
        if (!targets) {
          unmapped += 1
          continue
        }
        for (const target of targets) sourceTexts.set(`${target.bookId}:${target.chapter}:${target.verse}`, text)
      }
    }
  }

  if (unmapped) console.log(`  ${id}: ${unmapped} source verses had no Jewish target; dropped`)
  await emitTranslation(id, sourceTexts, corpus, [url])
}

// ---------------------------------------------------------------------- SCT
// Sefaria-Export GCS bucket, one file per book: `{ text: [[verse, ...], ...] }`
// with text[chapter-1][verse-1]. Jewish versification natively, so no
// conversion — but coverage is partial (books and verses may be missing).
type SefariaText = { text: Array<Array<string>> }

const SEFARIA_ROMAN = new Map<string, string>([
  ['sam1', 'I Samuel'], ['sam2', 'II Samuel'], ['kgs1', 'I Kings'], ['kgs2', 'II Kings'],
  ['chr1', 'I Chronicles'], ['chr2', 'II Chronicles'],
])

const TORAH = new Set(['gen', 'exod', 'lev', 'num', 'deut'])
const PROPHETS = new Set(['josh', 'judg', 'sam1', 'sam2', 'kgs1', 'kgs2', 'isa', 'jer', 'ezek', 'hos', 'joel', 'amos', 'obad', 'jonah', 'mic', 'nah', 'hab', 'zeph', 'hag', 'zech', 'mal'])

function sctCategory(bookId: string) {
  if (TORAH.has(bookId)) return 'Torah'
  if (PROPHETS.has(bookId)) return 'Prophets'
  return 'Writings'
}

async function importSct(corpus: Corpus) {
  const sourceTexts = new Map<JewishKey, string>()
  const sources: string[] = []

  for (const book of books) {
    const title = SEFARIA_ROMAN.get(book.id) ?? book.name
    const url = `https://storage.googleapis.com/sefaria-export/json/Tanakh/${sctCategory(book.id)}/${encodeURIComponent(title)}/English/${encodeURIComponent('Sefaria Community Translation')}.json`
    sources.push(url)
    const response = await fetch(url)
    if (!response.ok) continue // No SCT for this book.
    const data = (await response.json()) as SefariaText
    for (const [chapterIndex, verses] of data.text.entries()) {
      for (const [verseIndex, verse] of verses.entries()) {
        const text = cleanText(verse ?? '')
        if (!text) continue
        sourceTexts.set(`${book.id}:${chapterIndex + 1}:${verseIndex + 1}`, text)
      }
    }
  }

  await emitTranslation('sct', sourceTexts, corpus, sources)
}

async function main() {
  const corpus = JSON.parse(await readFile(join(generated, 'oshb-corpus.json'), 'utf8')) as Corpus
  const citationMap = JSON.parse(await readFile(join(generated, 'jewish-to-christian-citation-map.json'), 'utf8')) as {
    jewishToChristian: Record<JewishKey, { book: string; chapter: number; verse: number }>
  }
  const reverse = buildReverseMap(citationMap)

  console.log('Importing WEB (Christian system, converted)…')
  await importWeb(corpus, reverse)
  console.log('Importing YLT (Christian system, converted)…')
  await importScrollmapper('ylt', corpus, reverse)
  console.log('Importing BSB (Christian system, converted)…')
  await importScrollmapper('bsb', corpus, reverse)
  console.log('Importing Sefaria Community Translation (Jewish system, aligned)…')
  await importSct(corpus)
}

void main()
