import { NextResponse } from 'next/server'
import { validateBookChapter } from '@/lib/books'
import { getExternalCatalog } from '@/lib/corpus'

type AlignedWord = { id: string; start: number; end: number }
type WordAlignment = { book: string; chapter: number; words: AlignedWord[] }

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const validated = validateBookChapter(params.get('book'), params.get('chapter'))
  if (!validated.ok) return NextResponse.json({ words: [], error: validated.error }, { status: 400 })

  const { book, chapter } = validated.value
  try {
    const alignment = await getExternalCatalog(`word-alignment/${book.id}-${chapter}.json`) as unknown as WordAlignment
    if (!Array.isArray(alignment.words) || alignment.words.length === 0) {
      return NextResponse.json({ words: [] })
    }
    return NextResponse.json({ words: alignment.words })
  } catch {
    // Karaoke is optional enrichment; a missing alignment must not break reading.
    return NextResponse.json({ words: [] })
  }
}
