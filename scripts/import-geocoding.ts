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
  verses?: Array<{
    usx: string
    instance_types?: Record<string, number>
    /** Other ancient place ids the same word may refer to in this verse. */
    alternate_roots?: Record<string, number>
  }>
  identifications?: Array<{
    resolutions?: Array<{ lonlat?: string }>
    media?: { thumbnail?: { image_id?: string } }
  }>
  media?: { thumbnail?: { image_id?: string } }
  modern_associations?: Record<string, { name: string; score: number }>
  /** English renderings across the ten source translations, e.g. Abanah/Acco/Akko. */
  translation_name_counts?: Record<string, number>
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

type LexiconEntry = { id: string; gloss: string; transliteration?: string; partOfSpeech?: string[] }

type Lexicon = Record<string, LexiconEntry>

function lemmaKey(lemma: string) {
  return (lemma.split('/').at(-1) ?? lemma).replaceAll(' ', '').toLowerCase()
}

function normalizeName(value: string) {
  return (value ?? '')
    // BDB glosses append cross-reference notes like "Abdon. Compare" or
    // "Lebaoth. See also"; the note is not part of the name.
    .replace(/\s*\.\s*(Compare|See also|See)(\s.*)?$/i, '')
    .replace(/\s*\.\s*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase()
    // Drop disambiguation suffixes like "Achzib 1" / "Geba 1".
    .replace(/\s+\d+$/, '')
    // Strip leading article and possessive "of the"-style prefixes.
    .replace(/^(the|mount|valley of|plain of|wilderness of|sea of)\s+/i, '')
    .replace(/[^a-z]/g, '')
}

/**
 * Normalises a BDB transliteration to its bare letters. BDB writes Hebrew
 * names with diacritics and prefixed glottal marks (ʾābēl kĕrāmîm); stripping
 * those yields the plain name, which is how upstream spells the same place.
 */
function normalizeTransliteration(value: string) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    // Strip combining diacritics (macrons, breves, acute marks).
    .replace(/[\u0300-\u036f]/g, '')
    // Strip glottal/apostrophe marks used by BDB for aleph/ayin.
    .replace(/[\u02b9\u02bf\u02c8\u2018\u2019]/g, '')
    .replace(/[^a-z]/g, '')
}

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

/**
 * Upstream's translation_name_counts mixes two kinds of variants: genuine
 * spellings of the same name (Abronah/Ebronah, Accho/Akko) and places other
 * translations rendered with a different name entirely ("Tyre" for Babylon,
 * "Gilgal" for Galilee). Only the first kind may auto-link — a cross-name
 * rendering would attach a Babylon card to the word צֹר. So a variant counts
 * only when it is plausibly the same name spelled differently: within two
 * edits of the canonical name, or a shared stem of at least four letters
 * (which also admits compound parts like "Abel" in Abel-beth-maacah).
 */
function isSpellingVariant(variant: string, canonical: string) {
  if (variant === canonical) return true
  if (levenshtein(variant, canonical) <= 2) return true
  return Math.min(variant.length, canonical.length) >= 4
    && (variant.startsWith(canonical) || canonical.startsWith(variant))
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
  // Mentions the word-linker may consider: upstream marks how each translation
  // renders the instance, and only proper-name usages correspond to a tagged
  // Hebrew place word (the rest are "person", "common_noun", ...).
  const linkableByVerse = new Map<string, Set<string>>()
  // placeId -> alternate placeIds it shares a word with, per Jewish verse.
  const alternateRootsByVerse = new Map<string, Map<string, string[]>>()
  const byLexicon: Record<string, string[]> = {}
  let mentionCount = 0
  let mappableCount = 0
  let nonNameMentions = 0

  /** friendly_id first so the canonical spelling wins over variants. */
  function nameVariants(place: AncientPlace) {
    const canonical = normalizeName(place.friendly_id)
    const names = [...new Set([place.friendly_id, ...Object.keys(place.translation_name_counts ?? {})])]
      .map(normalizeName)
    return names.filter((name) => name && isSpellingVariant(name, canonical))
  }

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
      // A Christian ref can resolve to several Jewish verses (Psalm heading
      // splits); index under each so chapter bars and word matching both see it.
      for (const jewishKey of jewishCandidates) {
        const ids = byVerse[jewishKey] ??= []
        if (!ids.includes(place.id)) ids.push(place.id)
        if (verse.instance_types?.name) {
          const linkable = linkableByVerse.get(jewishKey) ?? new Set<string>()
          linkable.add(place.id)
          linkableByVerse.set(jewishKey, linkable)
        } else {
          nonNameMentions += 1
        }
        // Upstream notes which other places the same word may denote here —
        // Sea of Galilee's word is the same כִּנֶּרֶת that names Chinnereth.
        // Record the alternate root so the word, once linked to either, can
        // carry both place cards.
        for (const alternateId of Object.keys(verse.alternate_roots ?? {})) {
          const alt = alternateRootsByVerse.get(jewishKey) ?? new Map<string, string[]>()
          const list = alt.get(place.id) ?? []
          if (!list.includes(alternateId)) list.push(alternateId)
          alt.set(place.id, list)
          alternateRootsByVerse.set(jewishKey, alt)
        }
      }
    }
  }

  // Link places to lexicon entries by matching proper-noun words inside the
  // verse the place is mentioned in. The verse is the search window; the link
  // is stored against the word's lexicon entry, not the verse.
  const byVerseLinked: Record<string, number> = {}
  // jewishKey -> (placeId -> entryId that matched it), for the alternate pass.
  const entryByPlace = new Map<string, Map<string, string>>()
  let linkedExact = 0
  let linkedVariant = 0
  let linkedFuzzy = 0
  let linkedTranslit = 0
  const variantNames = new Map<string, { names: string[]; canonical: string }>()
  for (const place of ancient) if (places[place.id]) variantNames.set(place.id, { names: nameVariants(place), canonical: normalizeName(place.friendly_id) })

  function addLink(entryId: string, placeId: string, jewishKey: string, isCanonical: boolean) {
    byVerseLinked[jewishKey] = (byVerseLinked[jewishKey] ?? 0) + 1
    if (isCanonical) linkedExact += 1
    else linkedVariant += 1
    linkEntry(entryId, placeId, jewishKey)
  }

  function addFuzzyLink(entryId: string, placeId: string, jewishKey: string) {
    byVerseLinked[jewishKey] = (byVerseLinked[jewishKey] ?? 0) + 1
    linkedFuzzy += 1
    linkEntry(entryId, placeId, jewishKey)
  }

  function linkEntry(entryId: string, placeId: string, jewishKey: string) {
    if (!(byLexicon[entryId] ?? []).includes(placeId)) byLexicon[entryId] = [...(byLexicon[entryId] ?? []), placeId]
    // Record which entry matched which place, so the alternate-root pass can
    // copy the link to the alternate place the same word also denotes.
    const byPlace = entryByPlace.get(jewishKey) ?? new Map<string, string>()
    byPlace.set(placeId, entryId)
    entryByPlace.set(jewishKey, byPlace)
  }

  /**
   * Matches a place's gated name variants against a verse's proper-noun
   * words. Returns the lexicon entry id of the matching word, or undefined.
   * Order: exact gloss, length-aware fuzzy, then transliteration.
   */
  // Fuzzy collisions between unrelated names that are one edit apart at five
  // letters. Each is verified: the Hebrew word is a person or distinct place
  // whose name merely resembles the place's spelling (KJV "Tyrus" vs "Cyrus",
  // the king mentioned in the same verse as Tyre). Do not link them.
  const fuzzyExclusions = new Set(['cyrus|tyrus'])
  function fuzzyAllowed(gloss: string, name: string) {
    return !fuzzyExclusions.has(`${gloss}|${name}`)
  }
  function matchPlace(
    info: { names: string[]; canonical: string },
    properNouns: Map<string, string>,
    translitNames: Map<string, string>,
  ): string | undefined {
    const exact = info.names.find((name) => properNouns.has(name))
    if (exact) return properNouns.get(exact)!
    for (const [gloss, entryId] of properNouns) {
      for (const name of info.names) {
        const short = Math.min(gloss.length, name.length)
        if (short < 4) continue
        const tolerance = short >= 6 ? 2 : 1
        if (levenshtein(gloss, name) <= tolerance && fuzzyAllowed(gloss, name)) return entryId
      }
    }
    return translitNames.get(info.canonical)
  }

  for (const [jewishKey, placeIds] of linkableByVerse) {
    const [bookId, chapter, verseNumber] = jewishKey.split(':')
    const chapterVerses = await bookCache(bookId)
    const verse = chapterVerses[chapter]?.find((item) => item.number === Number(verseNumber))
    if (!verse) continue
    const properNouns = new Map<string, string>()
    // BDB glosses are definitions, not names — "plain of the vineyards" for
    // אָבֵל כְּרָמִים — so a word can be a place its gloss never says. The
    // transliteration carries the name, so index both.
    const translitNames = new Map<string, string>()
    for (const word of verse.words) {
      const entry = lexicon[lemmaKey(word.lemma)]
      // A place is a proper noun. Trust the lexicon part-of-speech when it
      // declares one; fall back to the word's own Np morphology segment. Np
      // is terminal or slash-prefixed (HNp, HTd/Np), never part of a Niphal
      // verb, which always continues into person/number (HVNp3cs).
      const isProper = (entry?.partOfSpeech ?? []).some((pos) => /^n\.pr/.test(pos))
        || /Np(?=\/|$)/.test(word.morphology ?? '')
      // First-wins per normalized gloss keeps a repeated gloss deterministic.
      if (entry && isProper && !properNouns.has(normalizeName(entry.gloss))) {
        properNouns.set(normalizeName(entry.gloss), entry.id)
      }
      if (entry && isProper && entry.transliteration && !translitNames.has(normalizeTransliteration(entry.transliteration))) {
        translitNames.set(normalizeTransliteration(entry.transliteration), entry.id)
      }
    }
    if (!properNouns.size && !translitNames.size) continue
    for (const placeId of placeIds) {
      const info = variantNames.get(placeId)
      if (!info) continue
      const matched = matchPlace(info, properNouns, translitNames)
      if (!matched) continue
      // Attribute by how it matched: exact/variant vs fuzzy vs transliteration.
      if (info.names.some((name) => properNouns.has(name))) {
        const exact = info.names.find((name) => properNouns.has(name))!
        addLink(properNouns.get(exact)!, placeId, jewishKey, exact === info.canonical)
      } else if (translitNames.get(info.canonical) === matched) {
        byVerseLinked[jewishKey] = (byVerseLinked[jewishKey] ?? 0) + 1
        linkedTranslit += 1
        linkEntry(matched, placeId, jewishKey)
      } else {
        addFuzzyLink(matched, placeId, jewishKey)
      }
    }
  }

// Alternate-root pass: upstream notes that a verse's word for one place may
  // denote another (Sea of Galilee's word is the same כִּנֶּרֶת as Chinnereth,
  // and Chinnereth is cited elsewhere, not here). Match each alternate place's
  // name against the verse words with the same machinery, and link the word to
  // both the alternate and the place that lists it.
  let linkedAlternate = 0
  for (const [jewishKey, placeIds] of linkableByVerse) {
    const altRoots = alternateRootsByVerse.get(jewishKey)
    if (!altRoots) continue
    const [bookId, chapter, verseNumber] = jewishKey.split(':')
    const chapterVerses = await bookCache(bookId)
    const verse = chapterVerses[chapter]?.find((item) => item.number === Number(verseNumber))
    if (!verse) continue
    const properNouns = new Map<string, string>()
    const translitNames = new Map<string, string>()
    for (const word of verse.words) {
      const entry = lexicon[lemmaKey(word.lemma)]
      const isProper = (entry?.partOfSpeech ?? []).some((pos) => /^n\.pr/.test(pos))
        || /Np(?=\/|$)/.test(word.morphology ?? '')
      if (entry && isProper && !properNouns.has(normalizeName(entry.gloss))) {
        properNouns.set(normalizeName(entry.gloss), entry.id)
      }
      if (entry && isProper && entry.transliteration && !translitNames.has(normalizeTransliteration(entry.transliteration))) {
        translitNames.set(normalizeTransliteration(entry.transliteration), entry.id)
      }
    }
    if (!properNouns.size && !translitNames.size) continue
    for (const [listingPlaceId, alternates] of altRoots) {
      for (const alternateId of alternates) {
        const alternateInfo = variantNames.get(alternateId)
        if (!alternateInfo) continue
        const matched = matchPlace(alternateInfo, properNouns, translitNames)
        if (!matched) continue
        linkEntry(matched, alternateId, jewishKey)
        linkEntry(matched, listingPlaceId, jewishKey)
        linkedAlternate += 1
      }
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
    nonNameMentions,
    versesCovered: Object.keys(byVerse).length,
    versesWithWordLink: Object.keys(byVerseLinked).length,
    wordLinkedMentions: linkedMentions,
    wordLinkedExact: linkedExact,
    wordLinkedByVariant: linkedVariant,
    wordLinkedFuzzy: linkedFuzzy,
    wordLinkedByTransliteration: linkedTranslit,
    wordLinkedByAlternate: linkedAlternate,
    lexiconEntriesLinked: Object.keys(byLexicon).length,
    overrideEntries: Object.keys(overrides).filter((key) => !key.startsWith('_')).length,
  }
  await writeFile(join(generated, 'geocoding-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify(manifest, null, 2))
}

void main()