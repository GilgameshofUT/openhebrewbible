import { NextResponse } from 'next/server'
import { getBook, getLexicon, getOccurrenceIndex, lemmaKey } from '@/lib/corpus'
import { plainTranslation, withSofPasuq } from '@/lib/text'

/** Cap results so a very common particle cannot return tens of thousands of rows. */
const MAX_OCCURRENCES = 500

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const lexiconId = params.get('lexiconId')
  if (!lexiconId) return NextResponse.json({ occurrences: [], error: 'lexiconId is required.' }, { status: 400 })

  let index
  try {
    index = await getOccurrenceIndex()
  } catch {
    return NextResponse.json(
      { occurrences: [], error: 'Occurrence index not built. Run npm run build:derived.' },
      { status: 503 },
    )
  }

  // Precomputed index turns what was a full-corpus scan into one lookup.
  const hits = index[lexiconId] ?? []
  const total = hits.length
  const page = hits.slice(0, MAX_OCCURRENCES)

  // Lexicon keys are Strong's-style numbers while entry ids are opaque codes,
  // so resolve every key that maps to this entry before matching words.
  const lexicon = await getLexicon()
  const entryKeys = new Set(Object.keys(lexicon).filter((key) => lexicon[key].id === lexiconId))

  // Load only the books actually referenced by this lemma.
  const bookIds = [...new Set(page.map(([bookId]) => bookId))]
  const loaded = new Map(
    await Promise.all(bookIds.map(async (bookId) => [bookId, await getBook(bookId)] as const)),
  )

  const occurrences = page.flatMap(([bookId, chapter, verseNumber]) => {
    const verse = loaded.get(bookId)?.[String(chapter)]?.find((item) => item.number === verseNumber)
    if (!verse) return []
    const words = verse.words.filter((word) => entryKeys.has(lemmaKey(word.lemma)))
    const hebrew = withSofPasuq(verse.hebrew ?? words.map((word) => word.text).join(' '))
    return [{
      book: bookId,
      chapter,
      verse: verseNumber,
      hebrew,
      english: plainTranslation(verse.english ?? ''),
      words: words.map((word) => word.text),
    }]
  })

  return NextResponse.json({ occurrences, total, truncated: total > page.length }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })
}
