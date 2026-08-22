/**
 * Builds the geocoding index from openbible.info's Bible-Geocoding-Data.
 *
 * The upstream data is keyed by Protestant verse references (USX codes such
 * as `2KI 5:12`). The reader is Jewish-versification canonical, so every
 * mention is converted through the reverse of jewish-to-christian-citation-map
 * before being indexed. Places are then linked to lexicon entries by matching
 * proper-noun words inside the verse the place is mentioned in — the verse is
 * only the search window; the link is stored against the word's lexicon entry.
 *
 * A committed override file (data/geocoding-overrides.json) fixes the matches
 * the automatic name comparison cannot make (e.g. upstream "Abana" vs the
 * BDB gloss "Amana").
 *
 * Outputs:
 *   data/generated/geocoding-index.json
 *   data/generated/geocoding-manifest.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const sourceDir = join(root, 'data', 'sources', 'geocoding')
const generated = join(root, 'data', 'generated')
const booksDir = join(generated, 'books')
const source = 'https://github.com/openbibleinfo/Bible-Geocoding-Data'

/** Upstream USX book code -> the name the citation map uses for Christian refs. */
const usxToCitation: Record<string, string> = {
  GEN: 'Gen', EXO: 'Ex', LEV: 'Lev', NUM: 'Num', DEU: 'Deut', JOS: 'Josh', JDG: 'Judg', RUT: 'Ruth',
  '1SA': '1Sam', '2SA': '2Sam', '1KI': '1Kings', '2KI': '2Kings', '1CH': '1Chr', '2CH': '2Chr',
  EZR: 'Ezra', NEH: 'Neh', EST: 'Esth', JOB: 'Job', PSA: 'Ps', PRO: 'Prov', ECC: 'Eccl', SNG: 'Song',
  ISA: 'Isa', JER: 'Jer', LAM: 'Lam', EZK: 'Ezek', DAN: 'Dan', HOS: 'Hos', JOL: 'Joel', AMO: 'Am',
  OBA: 'Ob', JON: 'Jon', MIC: 'Mic', NAM: 'Nah', HAB: 'Hab', ZEP: 'Zeph', HAG: 'Hag', ZEC: 'Zech', MAL: 'Mal',
}

type AncientPlace = {
  id: string
  friendly_id: string
  url_slug: string
  types: string[]
  verses?: Array<{ usx: string }>
  identifications?: Array<{
    resolutions?: Array<{ lonlat?: string }>
    media?: { thumbnail?: { image_id?: string } }
  }>
  media?: { thumbnail?: { image_id?: string } }
  modern_associations?: Record<string, { name: string; score: number }>
}

type ImageRecord = { id: string; thumbnail_url_pattern: string }

type GeoPlace = {
  id: string
  name: string
  slug: string
  types: string[]
  lonlat: string
  modernName?: string
  thumbnailUrl?: string
}

type LexiconEntry = { id: string; gloss: string; partOfSpeech?: string[] }

type Lexicon = Record<string, LexiconEntry>

function lemmaKey(lemma: string) {
  return (lemma.split('/').at(-1) ?? lemma).replaceAll(' ', '').toLowerCase()
}

function normalizeName(value: string) {
  return (value ?? '')
    .toLowerCase()
    // Drop disambiguation suffixes like "Achzib 1" / "Geba 1".
    .replace(/\s+\d+$/, '')
    // Strip leading article and possessive "of the"-style prefixes.
    .replace(/^(the|mount|valley of|plain of|wilderness of|sea of)\s+/i, '')
    .replace(/[^a-z]/g, '')
}

function memoizeByKey<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (key: string) => {
    let existing = cache.get(key)
    if (!existing) {
      existing = load(key)
      cache.set(key, existing)
    }
    return existing
  }
}

/**
 * Reads a raw JSONL source, fetching it from the pinned upstream into
 * data/sources/geocoding/ on first use (those files are gitignored, like the
 * OSHB sources).
 */
async function readSource(path: string) {
  const target = join(sourceDir, path)
  try {
    return await readFile(target, 'utf8')
  } catch {
    // fall through to fetch
  }
  const response = await fetch(`${source}/raw/master/data/${path}`)
  if (!response.ok) throw new Error(`Could not fetch geocoding ${path}: ${response.status}`)
  const text = await response.text()
  await mkdir(sourceDir, { recursive: true })
  await writeFile(target, text)
  return text
}

async function main() {
  const [ancientRaw, imageRaw, lexiconRaw, citationRaw, overridesRaw] = await Promise.all([
    readSource('ancient.jsonl'),
    readSource('image.jsonl'),
    readFile(join(generated, 'oshb-lexicon.json'), 'utf8'),
    readFile(join(generated, 'jewish-to-christian-citation-map.json'), 'utf8'),
    readFile(join(root, 'data', 'geocoding-overrides.json'), 'utf8').catch(() => '{}'),
  ])
  const ancient = ancientRaw.split('\n').filter(Boolean).map((line) => JSON.parse(line) as AncientPlace)
  const images = new Map<string, ImageRecord>(
    imageRaw.split('\n').filter(Boolean).map((line) => {
      const record = JSON.parse(line) as ImageRecord
      return [record.id, record]
    }),
  )
  const lexicon = JSON.parse(lexiconRaw) as Lexicon
  const citation = JSON.parse(citationRaw) as { jewishToChristian: Record<string, { book: string; chapter: number; verse: number }> }
  const overrides = JSON.parse(overridesRaw) as Record<string, string[]>

  // Reverse the citation map: Christian ref -> Jewish ref. The Christian
  // system can reference a verse that maps to several Jewish verses (Psalm
  // superscripts split differently), so the value is a candidate list.
  const christianToJewish = new Map<string, string[]>()
  for (const [jewish, christian] of Object.entries(citation.jewishToChristian)) {
    const key = `${christian.book} ${christian.chapter}:${christian.verse}`
    const existing = christianToJewish.get(key) ?? []
    existing.push(jewish)
    christianToJewish.set(key, existing)
  }

const bookCache = memoizeByKey<Record<string, Array<{ number: number; words: Array<{ lemma: string; morphology?: string }> }>>>((bookId) =>
  readFile(join(booksDir, `${bookId}.json`), 'utf8').then((raw) => JSON.parse(raw) as never),
)

  const places: Record<string, GeoPlace> = {}
  const byVerse: Record<string, string[]> = {}
  const byLexicon: Record<string, string[]> = {}
  let mentionCount = 0
  let mappableCount = 0

  for (const place of ancient) {
    const lonlat = place.identifications
      ?.flatMap((identification) => identification.resolutions ?? [])
      .find((resolution) => resolution.lonlat)?.lonlat
    if (!lonlat) continue

    const imageId = place.media?.thumbnail?.image_id
      ?? place.identifications?.find((identification) => identification.media?.thumbnail?.image_id)?.media?.thumbnail?.image_id
    const image = imageId ? images.get(imageId) : undefined
    const thumbnailUrl = image?.thumbnail_url_pattern?.replace('####', '512')

    const modernAssociation = Object.values(place.modern_associations ?? {})
      .sort((a, b) => b.score - a.score)[0]

    places[place.id] = {
      id: place.id,
      name: place.friendly_id,
      slug: place.url_slug,
      types: place.types ?? [],
      lonlat,
      ...(modernAssociation ? { modernName: modernAssociation.name } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    }

    for (const verse of place.verses ?? []) {
      mentionCount += 1
      const [code, reference] = verse.usx.split(' ')
      const citationName = usxToCitation[code]
      if (!citationName) continue
      const jewishCandidates = christianToJewish.get(`${citationName} ${reference}`)
      if (!jewishCandidates?.length) continue
      mappableCount += 1
      for (const jewishKey of jewishCandidates) {
        ;(byVerse[jewishKey] ??= []).push(place.id)
      }
    }
  }

  // Link places to lexicon entries by matching proper-noun words inside the
  // verse the place is mentioned in. The verse is the search window; the link
  // is stored against the word's lexicon entry, not the verse.
  const byVerseLinked: Record<string, number> = {}
  for (const [jewishKey, placeIds] of Object.entries(byVerse)) {
    const [bookId, chapter, verseNumber] = jewishKey.split(':')
    const chapterVerses = await bookCache(bookId)
    const verse = chapterVerses[chapter]?.find((item) => item.number === Number(verseNumber))
    if (!verse) continue
    const properNouns = new Map<string, string>()
    for (const word of verse.words) {
      const entry = lexicon[lemmaKey(word.lemma)]
      // A place is a proper noun. Trust the lexicon part-of-speech when it
      // declares one; fall back to the word's own Np morphology segment
      // (unprefixed, so HVNp3cs Niphal verbs are excluded).
      const isProper = (entry?.partOfSpeech ?? []).some((pos) => /^n\.pr/.test(pos))
        || /\bNp\b/.test(word.morphology ?? '')
      if (entry && isProper) {
        properNouns.set(normalizeName(entry.gloss), entry.id)
      }
    }
    for (const placeId of placeIds) {
      const place = places[placeId]
      const name = normalizeName(place.name)
      const entryId = properNouns.get(name)
      if (!entryId) continue
      byVerseLinked[jewishKey] = (byVerseLinked[jewishKey] ?? 0) + 1
      if (!(byLexicon[entryId] ?? []).includes(placeId)) byLexicon[entryId] = [...(byLexicon[entryId] ?? []), placeId]
    }
  }

  for (const [entryId, placeIds] of Object.entries(overrides)) {
    if (entryId.startsWith('_')) continue
    for (const placeId of placeIds) {
      if (!places[placeId]) {
        console.warn(`Override for lexicon ${entryId} references unknown place ${placeId}`)
        continue
      }
      if (!(byLexicon[entryId] ?? []).includes(placeId)) byLexicon[entryId] = [...(byLexicon[entryId] ?? []), placeId]
    }
  }

  await mkdir(generated, { recursive: true })
  await writeFile(
    join(generated, 'geocoding-index.json'),
    JSON.stringify({ source, generatedAt: new Date().toISOString(), places, byVerse, byLexicon }),
  )

  const linkedMentions = Object.values(byVerseLinked).reduce((sum, count) => sum + count, 0)
  const manifest = {
    status: 'derived',
    source,
    places: Object.keys(places).length,
    mentions: mentionCount,
    mappableMentions: mappableCount,
    versesCovered: Object.keys(byVerse).length,
    versesWithWordLink: Object.keys(byVerseLinked).length,
    wordLinkedMentions: linkedMentions,
    lexiconEntriesLinked: Object.keys(byLexicon).length,
    overrideEntries: Object.keys(overrides).length,
  }
  await writeFile(join(generated, 'geocoding-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify(manifest, null, 2))
}

void main()