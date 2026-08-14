import { NextResponse } from 'next/server'
import { validateBookChapter } from '@/lib/books'
import { getBook, getCitationMap, getKjvBook, getLexicon, lemmaKey, type CorpusVerse } from '@/lib/corpus'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const validated = validateBookChapter(params.get('book') ?? 'gen', params.get('chapter') ?? '1')
  if (!validated.ok) return NextResponse.json({ verses: [], error: validated.error }, { status: 400 })

  const { book, chapter } = validated.value
  const translationParam = params.get('translation') ?? 'jps'
  if (translationParam !== 'jps' && translationParam !== 'kjv') {
    return NextResponse.json({ verses: [], error: `Unknown translation "${translationParam}".` }, { status: 400 })
  }

  let chapters
  try {
    chapters = await getBook(book.id)
  } catch {
    return NextResponse.json(
      { book: book.id, chapter, verses: [], error: 'Corpus not built. Run npm run import:oshb && npm run build:derived.' },
      { status: 503 },
    )
  }

  const lexicon = await getLexicon()
  const selected = chapters[String(chapter)] ?? []
  let verses: CorpusVerse[] = selected

  if (translationParam === 'kjv') {
    // Hebrew versification is canonical; the KJV text is joined through the
    // explicit citation map rather than assuming chapter/verse alignment.
    const citationMap = await getCitationMap()
    const kjv = await getKjvBook(book.kjvFile)
    verses = selected.map((verse) => {
      const mapped = citationMap.jewishToEnglish[`${book.id}:${chapter}:${verse.number}`]
      if (!mapped) return { ...verse, english: '' }
      return {
        ...verse,
        english: kjv.get(`${mapped.chapter}:${mapped.verse}`) ?? '',
        englishReference: `${mapped.book} ${mapped.chapter}:${mapped.verse}`,
      }
    })
  }

  const enriched = verses.map((verse) => ({
    ...verse,
    words: verse.words.map((word) => {
      const entry = lexicon[lemmaKey(word.lemma)]
      return {
        ...word,
        morphologyLabel: word.morphologyLabel ?? word.morphology,
        lexiconId: entry?.id ?? null,
        lexicon: entry ?? null,
      }
    }),
  }))

  return NextResponse.json({ book: book.id, chapter, verses: enriched })
}
