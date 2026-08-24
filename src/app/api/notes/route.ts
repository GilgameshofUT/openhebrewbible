import { NextResponse } from 'next/server'
import { validateBookChapter } from '@/lib/books'
import { getExternalCatalog, getLexicon, type ExternalResource } from '@/lib/corpus'

/** Collapses a set of resources into a single expandable group entry. */
function groupResources(resources: ExternalResource[], title: string): ExternalResource[] {
  if (!resources.length) return []
  return [{
    ...resources[0],
    id: `group:${resources.map((resource) => resource.id).join('|')}`,
    title,
    kind: 'group',
    resources,
  }]
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const validated = validateBookChapter(params.get('book'), params.get('chapter'))
  if (!validated.ok) {
    return NextResponse.json({ notes: [], chapterNotes: [], verseNotes: {}, error: validated.error }, { status: 400 })
  }

  const { book, chapter } = validated.value
  const verse = params.get('verse')
  const lemma = params.get('lemma')

  try {
    const [daily, gilgamesh, aramaic, carmen, schenck, hebreways, henry, leningrad, vetusArticles, studyNotes] = await Promise.all([
      getExternalCatalog('daily-dose-of-hebrew-videos.json'),
      getExternalCatalog('gilgamesh-vocabulary-videos.json'),
      getExternalCatalog('daily-dose-of-aramaic-videos.json'),
      getExternalCatalog('carmen-joy-imes-videos.json'),
      getExternalCatalog('ken-schenck-videos.json'),
      getExternalCatalog('hebreways-videos.json'),
      getExternalCatalog('henry-abramson-videos.json'),
      getExternalCatalog('leningrad-codex-chapter-images.json'),
      getExternalCatalog('vetus-testamentum-articles.json').catch(() => ({ resources: [] as ExternalResource[] })),
      getExternalCatalog('study-notes.json').catch(() => ({ resources: [] as ExternalResource[] })),
    ])

    const chapterTarget = `chapter:${book.id}:${chapter}`
    const verseTarget = verse ? `verse:${book.id}:${chapter}:${verse}` : ''
    const studyResources = [...studyNotes.resources, ...vetusArticles.resources, ...daily.resources, ...gilgamesh.resources, ...aramaic.resources, ...carmen.resources, ...schenck.resources, ...hebreways.resources, ...henry.resources]

    let lemmaIds = new Set<string>()
    if (lemma) {
      const lexicon = await getLexicon()
      lemmaIds = new Set(
        Object.entries(lexicon)
          .filter(([key, entry]) => key === lemma || entry.id === lemma || entry.lexicalIndexId === lemma)
          .flatMap(([key, entry]) => [key, entry.id, entry.lexicalIndexId].filter((value): value is string => Boolean(value))),
      )
    }

    const chapterResources = [daily, gilgamesh, aramaic, carmen, schenck, hebreways, henry, leningrad, vetusArticles, studyNotes].flatMap((catalog) =>
      catalog.resources.filter((resource) => resource.targets.includes(chapterTarget)),
    )
    const chapterNotes = [
      ...groupResources(chapterResources.filter((resource) => resource.kind === 'text'), 'Study Notes'),
      ...groupResources(chapterResources.filter((resource) => resource.kind === 'article'), 'Articles'),
      ...groupResources(chapterResources.filter((resource) => resource.kind === 'image'), 'Manuscript ℒ'),
      ...groupResources(chapterResources.filter((resource) => resource.kind === 'video'), 'Chapter resources'),
    ]

    const versePrefix = `verse:${book.id}:${chapter}:`
    const verseTargets = [...new Set(
      studyResources.flatMap((resource) => resource.targets).filter((target) => target.startsWith(versePrefix)),
    )]
    const verseNotes = Object.fromEntries(verseTargets.map((target) => {
      const forTarget = studyResources.filter((resource) => resource.targets.includes(target))
      const ordered = [
        ...forTarget.filter((resource) => resource.kind === 'text'),
        ...forTarget.filter((resource) => resource.kind === 'article'),
        ...forTarget.filter((resource) => resource.kind === 'video'),
      ]
      return [
        target.split(':').at(-1)!,
        groupResources(ordered, 'Notes'),
      ]
    }))

    const notesForTarget = [
      ...studyResources.filter((resource) => verseTarget && resource.targets.includes(verseTarget)),
      ...studyResources.filter((resource) =>
        resource.targets.some((target) => target.startsWith('lemma:') && lemmaIds.has(target.split(':').at(-1) ?? '')),
      ),
    ]
    const notes = [
      ...groupResources(notesForTarget.filter((resource) => resource.kind === 'text'), 'Study Notes'),
      ...groupResources(notesForTarget.filter((resource) => resource.kind === 'article'), 'Articles'),
      ...groupResources(notesForTarget.filter((resource) => resource.kind === 'video'), 'Study resources'),
    ]

    return NextResponse.json({ chapter: chapterTarget, chapterNotes, verseNotes, notes }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } })
  } catch {
    // External catalogues are optional enrichment; reading must not fail.
    return NextResponse.json({ notes: [], chapterNotes: [], verseNotes: {} }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } })
  }
}
