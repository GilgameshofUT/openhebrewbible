import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const outputDir = join(root, 'data', 'external')

type CatalogResource = {
  id: string
  provider: string
  kind: 'audio' | 'video'
  url: string
  embedUrl?: string
  title: string
  targetType: 'chapter' | 'verse' | 'lemma' | 'unmapped'
  targets: string[]
  status: 'published' | 'review'
  mappingMethod: string
  sourceReferenceSystem?: 'jewish' | 'christian'
  sourceReferences?: string[]
  flags?: string[]
  notes?: string
}

type Book = { id: string; name: string; chapters: number }

const books: Book[] = [
  ['gen', 'Genesis', 50], ['exod', 'Exodus', 40], ['lev', 'Leviticus', 27], ['num', 'Numbers', 36], ['deut', 'Deuteronomy', 34],
  ['josh', 'Joshua', 24], ['judg', 'Judges', 21], ['sam1', '1 Samuel', 31], ['sam2', '2 Samuel', 24], ['kgs1', '1 Kings', 22], ['kgs2', '2 Kings', 25],
  ['isa', 'Isaiah', 66], ['jer', 'Jeremiah', 52], ['ezek', 'Ezekiel', 48], ['hos', 'Hosea', 14], ['joel', 'Joel', 4], ['amos', 'Amos', 9],
  ['obad', 'Obadiah', 1], ['jonah', 'Jonah', 4], ['mic', 'Micah', 7], ['nah', 'Nahum', 3], ['hab', 'Habakkuk', 3], ['zeph', 'Zephaniah', 3],
  ['hag', 'Haggai', 2], ['zech', 'Zechariah', 14], ['mal', 'Malachi', 3], ['ps', 'Psalms', 150], ['prov', 'Proverbs', 31],
  ['job', 'Job', 42], ['song', 'Song of Songs', 8], ['ruth', 'Ruth', 4], ['lam', 'Lamentations', 5], ['eccl', 'Ecclesiastes', 12],
  ['esth', 'Esther', 10], ['dan', 'Daniel', 12], ['ezra', 'Ezra', 10], ['neh', 'Nehemiah', 13], ['chr1', '1 Chronicles', 29], ['chr2', '2 Chronicles', 36],
].map(([id, name, chapters]) => ({ id: id as string, name: name as string, chapters: chapters as number }))

const bookAliases = new Map<string, string>()
for (const book of books) {
  bookAliases.set(normalize(book.name), book.id)
  bookAliases.set(normalize(book.name.replace(/^\d+ /, '')), book.id)
}
bookAliases.set('psalm', 'ps')
bookAliases.set('psalms', 'ps')

const converterBookNames: Record<string, string> = {
  gen: 'Gen', exod: 'Ex', lev: 'Lev', num: 'Num', deut: 'Deut', josh: 'Josh', judg: 'Judg', ruth: 'Ruth',
  sam1: '1Sam', sam2: '2Sam', kgs1: '1Kings', kgs2: '2Kings', chr1: '1Chr', chr2: '2Chr', ezra: 'Ezra', neh: 'Neh',
  esth: 'Esth', job: 'Job', ps: 'Ps', prov: 'Prov', eccl: 'Eccl', song: 'Song', lam: 'Lam', isa: 'Isa', jer: 'Jer',
  ezek: 'Ezek', dan: 'Dan', hos: 'Hos', joel: 'Joel', amos: 'Am', obad: 'Ob', jonah: 'Jon', mic: 'Mic', nah: 'Nah',
  hab: 'Hab', zeph: 'Zeph', hag: 'Hag', zech: 'Zech', mal: 'Mal',
}

const converterBookIds = new Map(Object.entries(converterBookNames).map(([id, name]) => [name, id]))

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim()
}

function normalizeHebrew(value: string) {
  return value
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4]/g, '')
    .normalize('NFC')
}

function videoUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`
}

function embedUrl(id: string) {
  return `https://www.youtube.com/embed/${id}`
}

function soundcloudEmbedUrl(url: string) {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23792d39&auto_play=false&show_artwork=true`
}

type CitationMap = Map<string, Array<{ book: string; chapter: number; verse: number }>>

async function loadCitationMap(): Promise<CitationMap> {
  const source = await fetchText('https://raw.githubusercontent.com/GilgameshofUT/Hebrew-Citation-Converter/main/jewish-christian-verse-convert.py')
  const map: CitationMap = new Map()
  const pattern = /\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*:\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g
  for (const match of source.matchAll(pattern)) {
    const jewish = { book: match[1], chapter: Number(match[2]), verse: Number(match[3]) }
    const christianKey = `${match[4]}:${match[5]}:${match[6]}`
    map.set(christianKey, [...(map.get(christianKey) ?? []), jewish])
  }
  return map
}

function convertEnglishReference(bookId: string, chapter: number, verse: number, citationMap: CitationMap) {
  const book = converterBookNames[bookId]
  const mapped = citationMap.get(`${book}:${chapter}:${verse}`)
  if (mapped?.length) return mapped.map((item) => ({ bookId: converterBookIds.get(item.book) ?? bookId, chapter: item.chapter, verse: item.verse }))
  return [{ bookId, chapter, verse }]
}

function parseReferences(value: string, citationMap?: CitationMap): { targets: string[]; label: string; numberingMismatch: boolean }[] {
  const results: { targets: string[]; label: string; numberingMismatch: boolean }[] = []
  const singleChapterPattern = /(Obadiah|Joel|Amos|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Malachi|Ruth|Esther)\s+(\d+)([ab])?(?!\s*:)/gi
  for (const match of value.matchAll(singleChapterPattern)) {
    const bookId = bookAliases.get(normalize(match[1]))
    const book = books.find((item) => item.id === bookId)
    if (!book || book.chapters !== 1) continue
    const verse = Number(match[2])
    const converted = convertEnglishReference(bookId!, 1, verse, citationMap ?? new Map())
    results.push({
      targets: converted.map((item) => `verse:${item.bookId}:${item.chapter}:${item.verse}`),
      label: `${match[1]} ${verse}${match[3] ?? ''}`,
      numberingMismatch: converted.some((item) => item.bookId !== bookId || item.chapter !== 1 || item.verse !== verse),
    })
  }
  const pattern = /((?:1 |2 )?(?:Samuel|Kings|Chronicles)|(?:Song of Songs)|(?:Psalms?|Proverbs|Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Job|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah))\s+(\d+)\s*(?::\s*|\s+)(\d+)([a-z])?(?:\s*[–-]\s*(?:(\d+)\s*:\s*)?(\d+)([a-z])?)?/gi
  for (const match of value.matchAll(pattern)) {
    const bookId = bookAliases.get(normalize(match[1]))
    if (!bookId) continue
    const chapter = Number(match[2])
    const verse = Number(match[3])
    const suffix = match[4] ?? ''
    const endChapter = match[5] ? Number(match[5]) : chapter
    const endVerse = match[6] ? Number(match[6]) : verse
    const targets: string[] = []
    if (endChapter === chapter) {
      for (let current = verse; current <= endVerse; current += 1) for (const converted of convertEnglishReference(bookId, chapter, current, citationMap ?? new Map())) targets.push(`verse:${converted.bookId}:${converted.chapter}:${converted.verse}`)
    } else {
      for (const converted of convertEnglishReference(bookId, chapter, verse, citationMap ?? new Map())) targets.push(`verse:${converted.bookId}:${converted.chapter}:${converted.verse}${suffix}`)
    }
    const sourceTargets = Array.from({ length: endVerse - verse + 1 }, (_, index) => `verse:${bookId}:${chapter}:${verse + index}${index === 0 ? suffix : ''}`)
    results.push({ targets, label: `${match[1]} ${chapter}:${verse}${suffix}${match[6] ? `-${endVerse}${match[7] ?? ''}` : ''}`, numberingMismatch: sourceTargets.some((target, index) => targets[index] !== target) })
  }
  return results
}

function parseMechonCode(code: string) {
  const match = code.match(/^t(\d{2})([a-f]?)(\d{1,3})$/)
  if (!match) return undefined
  const number = Number(match[1])
  const chapter = match[2] && number === 26 ? 100 + (match[2].charCodeAt(0) - 97) * 10 + Number(match[3]) : Number(match[3])
  const codeBook: Record<string, string> = {
    '01': 'gen', '02': 'exod', '03': 'lev', '04': 'num', '05': 'deut', '06': 'josh', '07': 'judg', '08a': 'sam1', '08b': 'sam2',
    '09a': 'kgs1', '09b': 'kgs2', '10': 'isa', '11': 'jer', '12': 'ezek', '13': 'hos', '14': 'joel', '15': 'amos', '16': 'obad',
    '17': 'jonah', '18': 'mic', '19': 'nah', '20': 'hab', '21': 'zeph', '22': 'hag', '23': 'zech', '24': 'mal', '25a': 'chr1',
    '25b': 'chr2', '26': 'ps', '26a': 'ps', '26b': 'ps', '26c': 'ps', '26d': 'ps', '26e': 'ps', '26f': 'ps', '27': 'prov', '28': 'job', '29': 'song', '30': 'ruth', '31': 'lam', '32': 'eccl', '33': 'esth', '34': 'dan',
    '35a': 'ezra', '35b': 'neh',
  }
  const bookId = codeBook[`${String(number).padStart(2, '0')}${match[2]}`]
  if (!bookId) return undefined
  return { bookId, chapter }
}

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.text()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json() as Promise<T>
}

type Type929Post = { id: number; acf?: Record<string, unknown> }
type ChapterInfo = { book: string; chapter: string; chapter_main_number: string }
type SoundcloudTrack = { url: string; title: string }

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(collectStrings)
}

function chapterByOrdinal(ordinal: number) {
  let remaining = ordinal
  for (const book of books) {
    if (remaining <= book.chapters) return { book, chapter: remaining }
    remaining -= book.chapters
  }
  return undefined
}

const hebrewBookNames: Array<[string, string]> = [
  ['דברי הימים ב', 'chr2'], ['דברי הימים א', 'chr1'], ['שמואל א', 'sam1'], ['שמואל ב', 'sam2'],
  ['מלכים א', 'kgs1'], ['מלכים ב', 'kgs2'], ['בראשית', 'gen'], ['שמות', 'exod'], ['ויקרא', 'lev'],
  ['במדבר', 'num'], ['דברים', 'deut'], ['יהושע', 'josh'], ['שופטים', 'judg'], ['ישעיהו', 'isa'],
  ['ירמיהו', 'jer'], ['יחזקאל', 'ezek'], ['הושע', 'hos'], ['יואל', 'joel'], ['עמוס', 'amos'],
  ['עובדיה', 'obad'], ['יונה', 'jonah'], ['מיכה', 'mic'], ['נחום', 'nah'], ['חבקוק', 'hab'],
  ['צפניה', 'zeph'], ['חגי', 'hag'], ['זכריה', 'zech'], ['מלאכי', 'mal'], ['תהלים', 'ps'],
  ['משלי', 'prov'], ['איוב', 'job'], ['שיר השירים', 'song'], ['רות', 'ruth'], ['איכה', 'lam'],
  ['קהלת', 'eccl'], ['אסתר', 'esth'], ['דניאל', 'dan'], ['עזרא', 'ezra'], ['נחמיה', 'neh'],
]

function hebrewNumber(value: string) {
  const values: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 }
  return value.replace(/[״״׳']/g, '').split('').reduce((sum, letter) => sum + (values[letter] ?? 0), 0)
}

function chapterFromTitle(title: string) {
  for (const [bookName, bookId] of hebrewBookNames) {
    const match = title.match(new RegExp(`${bookName}\\s+([א-ת״׳"']+)`))
    if (match) {
      const chapter = hebrewNumber(match[1])
      if (chapter) return { bookId, chapter }
    }
  }
  const match = title.match(/(?:^|\s)(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms?|Proverbs|Job|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah)\s+(\d+)/i)
  if (!match) return undefined
  const bookId = bookAliases.get(normalize(match[1]))
  return bookId ? { bookId, chapter: Number(match[2]) } : undefined
}

function parseHebrewChapterTitle(title: string) {
  for (const [bookName, bookId] of hebrewBookNames) {
    const match = title.match(new RegExp(`${bookName}\\s+(?:פרק\\s+)?([א-ת״׳"']+)`))
    if (!match) continue
    const chapter = hebrewNumber(match[1])
    if (chapter) return { bookId, chapter }
  }
  return undefined
}

function parseSoundcloudSet(html: string) {
  const title = html.match(/<h1 itemprop="name"[^>]*><a[^>]*>(.*?)<\/a>/)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
  const tracks: SoundcloudTrack[] = []
  for (const match of html.matchAll(/<h2 itemprop="name"[^>]*><a itemprop="url" href="([^"]+)"[^>]*>(.*?)<\/a>/g)) {
    tracks.push({ url: new URL(match[1], 'https://soundcloud.com').toString(), title: match[2].replace(/<[^>]+>/g, '').trim() })
  }
  return { title, tracks }
}

async function fetchJsonWithRetry<T>(url: string) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fetchJson<T>(url)
    } catch (error) {
      if (attempt === 4) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
  throw new Error(`Unable to fetch ${url}`)
}

function titleMatchesChapter(title: string, chapter: { book: Book; chapter: number }) {
  const normalizedTitle = normalize(title)
  const normalizedBook = normalize(chapter.book.name)
  return normalizedTitle.includes(normalizedBook) || (chapter.book.id === 'gen' && normalizedTitle.includes('בראשית'))
}

async function build929Soundcloud(): Promise<{ sourceUrl: string; resources: CatalogResource[] }> {
  const existing = JSON.parse(await readFile(join(outputDir, '929-soundcloud-chapter-audio.json'), 'utf8')) as { sourceUrl: string; resources: CatalogResource[] }
  return existing
}

async function buildMechon() {
  const indexUrl = 'https://mechon-mamre.org/p/pt/ptmp3prq.htm'
  const html = await fetchText(indexUrl)
  const resources: CatalogResource[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+\.mp3)["']/gi)) {
    const relative = match[1]
    const filename = relative.split('/').pop() ?? ''
    const code = filename.replace(/\.mp3$/i, '')
    const parsed = parseMechonCode(code)
    if (!parsed || seen.has(code)) continue
    seen.add(code)
    const book = books.find((item) => item.id === parsed.bookId)
    if (!book) continue
    const url = new URL(relative, indexUrl).href
    resources.push({
      id: `mechon-mamre:${code}`,
      provider: 'Mechon-Mamre / Talking Bibles International',
      kind: 'audio',
      url,
      title: `${book.name} ${parsed.chapter} Hebrew reading`,
      targetType: 'chapter',
      targets: [`chapter:${book.id}:${parsed.chapter}`],
      status: 'published',
      mappingMethod: 'source-filename',
      notes: 'Chapter-level recording; no verse timestamps inferred.',
    })
  }
  resources.sort((a, b) => a.targets[0].localeCompare(b.targets[0]))
  return { sourceUrl: indexUrl, crawledAt: new Date().toISOString(), resources }
}

async function readYoutube(path: string) {
  const value = JSON.parse(await readFile(path, 'utf8')) as { channel: string; channel_id: string; entries?: Array<{ id?: string; title?: string }> }
  return { ...value, entries: (value.entries ?? []).filter((entry): entry is { id: string; title: string } => Boolean(entry.id && entry.title)) }
}

async function buildGilgamesh() {
  const source = await readYoutube('/tmp/gilgamesh-all.json')
  const corpus = JSON.parse(await readFile(join(root, 'data', 'generated', 'oshb-corpus.json'), 'utf8')) as Record<string, Record<string, Array<{ words?: Array<{ lemma?: string }> }>>>
  const canonicalLemmas = new Map<string, string>()
  for (const book of Object.values(corpus)) for (const chapter of Object.values(book)) for (const verse of chapter) for (const word of verse.words ?? []) {
    if (!word.lemma) continue
    const normalized = word.lemma.replace(/[\u0591-\u05C7]/g, '').normalize('NFC')
    canonicalLemmas.set(normalized, word.lemma)
  }
  const lexicon = JSON.parse(await readFile(join(root, 'data', 'generated', 'oshb-lexicon.json'), 'utf8')) as Record<string, { id: string; headword?: string }>
  const lexiconByHeadword = new Map<string, string[]>()
  for (const [key, entry] of Object.entries(lexicon)) {
    if (!entry.headword) continue
    const keyName = normalizeHebrew(entry.headword)
    lexiconByHeadword.set(keyName, [...(lexiconByHeadword.get(keyName) ?? []), entry.id || key])
  }
  const manualAliases: Record<string, string[]> = {
    מים: ['gvs'],
    עפעפים: ['עפעף'],
  }
  const resources: CatalogResource[] = []
  for (const entry of source.entries) {
    if (!/^Vocabulary word\b/i.test(entry.title)) continue
    const body = entry.title.replace(/^Vocabulary word\s*/i, '').replace(/\s+#\S+/g, '').trim()
    const hebrew = body.split('(')[0].trim()
    const glossMatch = body.match(/\)\s*[“"]([^“”"]+)[”"]?/)
    const transliteration = body.match(/\(([^)]+)\)/)?.[1]?.trim()
    const normalizedHebrew = normalizeHebrew(hebrew)
    const canonicalLemma = canonicalLemmas.get(normalizedHebrew)
    const lexiconIds = [...(lexiconByHeadword.get(normalizedHebrew) ?? []), ...(manualAliases[normalizedHebrew] ?? [])].filter((id, index, values) => values.indexOf(id) === index)
    const targets = lexiconIds.length
      ? lexiconIds.map((id) => `lemma:oshb-lexicon:${id}`)
      : [canonicalLemma ? `lemma:oshb:${canonicalLemma}` : `lemma:title:${normalizedHebrew}`]
    resources.push({
      id: `youtube:video:${entry.id}`,
      provider: source.channel,
      kind: 'video',
      url: videoUrl(entry.id),
      embedUrl: embedUrl(entry.id),
      title: entry.title,
      targetType: 'lemma',
      targets,
      status: lexiconIds.length || canonicalLemma ? 'published' : 'review',
      mappingMethod: lexiconIds.length ? 'title-lexicon-headword' : canonicalLemma ? 'title-exact-lemma' : 'title-lemma-review',
      notes: `Title Hebrew: ${hebrew}; transliteration: ${transliteration ?? 'not parsed'}; gloss: ${glossMatch?.[1] ?? 'not parsed'}. ${lexiconIds.length ? `Matched OSHB HebrewLexicon entries: ${lexiconIds.join(', ')}.` : canonicalLemma ? 'Exact normalized OSHB lemma match.' : 'No exact normalized OSHB lemma match; review root, spelling, or homonym and add all applicable canonical lemma targets.'}`,
    })
  }
  return { sourceUrl: 'https://www.youtube.com/@GilgameshofUtah', channelId: source.channel_id, crawledAt: new Date().toISOString(), resources }
}

async function buildDdoh(citationMap: CitationMap) {
  const source = await readYoutube('/tmp/ddoh-all.json')
  const resources: CatalogResource[] = []
  for (const entry of source.entries) {
    const references = parseReferences(entry.title, citationMap)
    const targets = references.flatMap((reference) => reference.targets)
    const isQna = /^Q&A\b/i.test(entry.title)
    const numberingMismatch = references.some((reference) => reference.numberingMismatch)
    resources.push({
      id: `youtube:video:${entry.id}`,
      provider: source.channel,
      kind: 'video',
      url: videoUrl(entry.id),
      embedUrl: embedUrl(entry.id),
      title: entry.title,
      targetType: targets.length ? 'verse' : 'unmapped',
      targets,
      status: targets.length && !isQna && !numberingMismatch ? 'published' : 'review',
      mappingMethod: targets.length ? 'title-reference' : 'title-review',
      sourceReferenceSystem: references.length ? 'christian' : undefined,
      sourceReferences: references.map((reference) => reference.label),
      flags: [isQna ? 'q-and-a' : '', numberingMismatch ? 'numbering-converted-review-required' : ''].filter(Boolean),
      notes: isQna ? 'Specific Christian-system reference parsed from a Q&A title and converted to the Jewish target system; verify individually before publication.' : numberingMismatch ? `Parsed Christian-system reference(s): ${references.map((reference) => reference.label).join('; ')}; at least one target changes under Hebrew-Citation-Converter, so verify the video scope and title individually.` : references.length ? `Parsed Christian-system reference(s): ${references.map((reference) => reference.label).join('; ')}; targets align with the Jewish system after conversion.` : 'No canonical verse reference parsed from title.',
    })
  }
  return { sourceUrl: 'https://www.youtube.com/@dailydoseofhebrew', channelId: source.channel_id, citationConverter: 'https://github.com/GilgameshofUT/Hebrew-Citation-Converter', sourceReferenceSystem: 'christian', targetReferenceSystem: 'jewish', crawledAt: new Date().toISOString(), resources }
}

function markdown(title: string, sourceUrl: string, resources: CatalogResource[], columns: string[]) {
  const lines = [`# ${title}`, '', `Source: [${sourceUrl}](${sourceUrl})`, `Generated: ${new Date().toISOString()}`, `Rows: ${resources.length}`, '', `| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`]
  for (const resource of resources) {
    const target = resource.targets.length ? resource.targets.join('<br>') : ''
    lines.push(`| ${resource.id} | ${resource.title.replaceAll('|', '\\|')} | ${target} | [watch/source](${resource.url}) | ${resource.status} |`)
  }
  return `${lines.join('\n')}\n`
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const mechon = await buildMechon()
  const gilgamesh = await buildGilgamesh()
  const citationMap = await loadCitationMap()
  const ddoh = await buildDdoh(citationMap)
  const soundcloud = await build929Soundcloud()
  const catalog = [...mechon.resources, ...soundcloud.resources, ...gilgamesh.resources, ...ddoh.resources]
  await writeFile(join(outputDir, 'mechon-mamre-chapter-audio.json'), `${JSON.stringify(mechon, null, 2)}\n`)
  await writeFile(join(outputDir, 'gilgamesh-vocabulary-videos.json'), `${JSON.stringify(gilgamesh, null, 2)}\n`)
  await writeFile(join(outputDir, 'daily-dose-of-hebrew-videos.json'), `${JSON.stringify(ddoh, null, 2)}\n`)
  await writeFile(join(outputDir, '929-soundcloud-chapter-audio.json'), `${JSON.stringify(soundcloud, null, 2)}\n`)
  await writeFile(join(outputDir, 'mechon-mamre-chapter-audio.md'), markdown('Mechon-Mamre Chapter Audio Catalog', mechon.sourceUrl, mechon.resources, ['ID', 'Title', 'Target', 'URL', 'Status']))
  await writeFile(join(outputDir, 'gilgamesh-vocabulary-videos.md'), markdown('Hebrew Bible with Gilgamesh Vocabulary Catalog', gilgamesh.sourceUrl, gilgamesh.resources, ['ID', 'Title', 'Target', 'URL', 'Status']))
  await writeFile(join(outputDir, 'daily-dose-of-hebrew-videos.md'), markdown('Daily Dose of Hebrew Video Catalog', ddoh.sourceUrl, ddoh.resources, ['ID', 'Title', 'Target(s)', 'URL', 'Status']))
  await writeFile(join(outputDir, '929-soundcloud-chapter-audio.md'), markdown('929 SoundCloud Chapter Audio Catalog', soundcloud.sourceUrl, soundcloud.resources, ['ID', 'Title', 'Target(s)', 'URL', 'Status']))
  await writeFile(join(outputDir, 'external-resource-catalog.md'), markdown('Web Tanakh External Resource Catalog', 'https://mechon-mamre.org/p/pt/ptmp3prq.htm', catalog, ['ID', 'Title', 'Target(s)', 'URL', 'Status']))
  console.log(JSON.stringify({ mechon: mechon.resources.length, soundcloud: soundcloud.resources.length, gilgamesh: gilgamesh.resources.length, ddoh: ddoh.resources.length, ddohMapped: ddoh.resources.filter((item) => item.targets.length).length }, null, 2))
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
