import { NextResponse } from 'next/server'
import { validateBookChapter } from '@/lib/books'
import { getBook, getCitationMap, getTranslationBook, getLexicon, lemmaKey, type CorpusVerse } from '@/lib/corpus'
import { isTranslationId, translationsById, joinTranslation, type Translation } from '@/lib/translations'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const validated = validateBookChapter(params.get('book') ?? 'gen', params.get('chapter') ?? '1')
  if (!validated.ok) return NextResponse.json({ verses: [], error: validated.error }, { status: 400 })

  const { book, chapter } = validated.value
  const translationParam = params.get('translation') ?? 'jps'
  if (!isTranslationId(translationParam)) {
    return NextResponse.json({ verses: [], error: `Unknown translation "${translationParam}".` }, { status: 400 })
  }
  const translation = translationsById.get(translationParam) as Translation
  let chapters
  try {
    chapters = await getBook(book.id)
  } catch {
    return NextResponse.json(
      { book: book.id, chapter, verses: [], error: 'Corpus not built. Run npm run import:oshb && npm run build:derived.' },
      { status: 503 },
    )
  }

  const selected = chapters[String(chapter)] ?? []
  let verses: CorpusVerse[] = selected

  if (!translation.embedded) {
    // Translations are stored in the corpus's own (Jewish) versification —
    // conversion happened once at import time. The citation map is only used
    // to surface the edition's original reference where the systems diverge.
    const text = await getTranslationBook(`${translationParam}:${book.kjvFile}`)
    const citationMap = translation.versification === 'christian' ? await getCitationMap() : null
    verses = selected.map((verse) => {
      const citation = citationMap?.jewishToChristian[`${book.id}:${chapter}:${verse.number}`]
      return { ...verse, ...joinTranslation(verse.number, chapter, translation, text, citation) }
    })
  }

  // Books baked by build:derived already carry lexiconId + morphologyLabel.
  // Fall back to a live lexicon lookup only for corpora built before this
  // optimization, so a missing rebuild doesn't break the route.
  const needsLexicon = verses.length > 0 && verses[0].words.length > 0 && verses[0].words[0].lexiconId === undefined
  let enriched: CorpusVerse[]
  if (needsLexicon) {
    const lexicon = await getLexicon()
    enriched = verses.map((verse) => ({
      ...verse,
      words: verse.words.map((word) => {
        const entry = lexicon[lemmaKey(word.lemma)]
        return {
          ...word,
          morphologyLabel: word.morphologyLabel ?? word.morphology,
          lexiconId: entry?.id ?? null,
        }
      }),
    }))
  } else {
    enriched = verses.map((verse) => ({
      ...verse,
      words: verse.words.map((word) => ({
        ...word,
        morphologyLabel: word.morphologyLabel ?? word.morphology,
        lexiconId: word.lexiconId ?? null,
      })),
    }))
  }

  return NextResponse.json({ book: book.id, chapter, verses: enriched }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400' } })
}
