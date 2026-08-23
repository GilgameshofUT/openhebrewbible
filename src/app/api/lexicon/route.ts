import { NextResponse } from 'next/server'
import { getLexiconById } from '@/lib/corpus'

/**
 * Returns the full BDB entry for one lexicon id. The chapter API only sends
 * `lexiconId` per word; the reader fetches the entry here when a word is
 * selected, so a chapter payload stays small instead of embedding a full
 * entry (with its senses tree) for every word.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  if (!id) return NextResponse.json({ error: 'The "id" parameter is required.' }, { status: 400 })

  const entry = await getLexiconById(id)
  if (!entry) return NextResponse.json({ error: `No lexicon entry with id "${id}".` }, { status: 404 })

  return NextResponse.json({ entry }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } })
}
