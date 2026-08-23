import { NextResponse } from 'next/server'
import { validateBookChapter } from '@/lib/books'
import { getExternalCatalog } from '@/lib/corpus'

const PROJECT_929_PRIMARY = '929-soundcloud-omer-frankel.json'
const PROJECT_929_FALLBACK = '929-soundcloud-chapter-audio.json'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const validated = validateBookChapter(params.get('book'), params.get('chapter'))
  if (!validated.ok) return NextResponse.json({ resources: [], error: validated.error }, { status: 400 })

  const { book, chapter } = validated.value
  try {
    const project929 = await getExternalCatalog(PROJECT_929_PRIMARY).catch(() => getExternalCatalog(PROJECT_929_FALLBACK))
    const mechon = await getExternalCatalog('mechon-mamre-chapter-audio.json')
    const target = `chapter:${book.id}:${chapter}`
    const resources = [project929, mechon].flatMap((catalog) =>
      catalog.resources.filter((resource) => resource.targets.includes(target)),
    )
    return NextResponse.json({ resources }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } })
  } catch {
    // Audio is optional enrichment; a missing catalogue must not break reading.
    return NextResponse.json({ resources: [] }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } })
  }
}
