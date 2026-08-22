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
    const [daily, gilgamesh, aramaic, carmen, schenck, hebreways, henry, leningrad] = await Promise.all([
      getExternalCatalog('daily-dose-of-hebrew-videos.json'),
      getExternalCatalog('gilgamesh-vocabulary-videos.json'),
      getExternalCatalog('daily-dose-of-aramaic-videos.json'),
      getExternalCatalog('carmen-joy-imes-videos.json'),
      getExternalCatalog('ken-schenck-videos.json'),
      getExternalCatalog('hebreways-videos.json'),
      getExternalCatalog('henry-abramson-videos.json'),
      getExternalCatalog('leningrad-codex-chapter-images.json'),
    ])

    const chapterTarget = `chapter:${book.id}:${chapter}`
    const verseTarget = verse ? `verse:${book.id}:${chapter}:${verse}` : ''
    const studyResources = [...daily.resources, ...gilgamesh.resources, ...aramaic.resources, ...carmen.resources, ...schenck.resources, ...hebreways.resources, ...henry.resources]

    let lemmaIds = new Set<string>()
    if (lemma) {
      const lexicon = await getLexicon()
      lemmaIds = new Set(
        Object.entries(lexicon)
          .filter(([key, entry]) => key === lemma || entry.id === lemma || entry.lexicalIndexId === lemma)
          .flatMap(([key, entry]) => [key, entry.id, entry.lexicalIndexId].filter((value): value is string => Boolean(value))),
      )
    }

    const chapterResources = [daily, gilgamesh, aramaic, carmen, schenck, hebreways, henry, leningrad].flatMap((catalog) =>
      catalog.resources.filter((resource) => resource.targets.includes(chapterTarget)),
    )
    const chapterNotes = [
      ...groupResources(chapterResources.filter((resource) => resource.kind === 'image'), 'Manuscript ℒ'),
      ...groupResources(chapterResources.filter((resource) => resource.kind !== 'image'), 'Chapter resources'),
    ]

    const versePrefix = `verse:${book.id}:${chapter}:`
    const verseTargets = [...new Set(
      studyResources.flatMap((resource) => resource.targets).filter((target) => target.startsWith(versePrefix)),
    )]
    const verseNotes = Object.fromEntries(verseTargets.map((target) => [
      target.split(':').at(-1),
      groupResources(studyResources.filter((resource) => resource.targets.includes(target)), 'Verse resources'),
    ]))

    const notes = groupResources([
      ...studyResources.filter((resource) => verseTarget && resource.targets.includes(verseTarget)),
      ...studyResources.filter((resource) =>
        resource.targets.some((target) => target.startsWith('lemma:') && lemmaIds.has(target.split(':').at(-1) ?? '')),
      ),
    ], 'Study resources')

    return NextResponse.json({ chapter: chapterTarget, chapterNotes, verseNotes, notes })
  } catch {
    // External catalogues are optional enrichment; reading must not fail.
    return NextResponse.json({ notes: [], chapterNotes: [], verseNotes: {} })
  }
}
