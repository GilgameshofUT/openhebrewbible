import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import JSON5 from 'json5'

const root = process.cwd()
const output = join(root, 'data', 'generated')
const sourceDir = join(root, 'data', 'sources')
const release = 'v.2.2'
const baseUrl = `https://raw.githubusercontent.com/openscriptures/morphhb/${release}/wlc`
const lexiconBase = 'https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master'
const translationBase = 'https://raw.githubusercontent.com/Yakubovich/tanakh/master/english'

const sourceBooks = [
  ['Gen', 'gen'], ['Exod', 'exod'], ['Lev', 'lev'], ['Num', 'num'], ['Deut', 'deut'],
  ['Josh', 'josh'], ['Judg', 'judg'], ['Ruth', 'ruth'], ['1Sam', 'sam1'], ['2Sam', 'sam2'],
  ['1Kgs', 'kgs1'], ['2Kgs', 'kgs2'], ['1Chr', 'chr1'], ['2Chr', 'chr2'], ['Ezra', 'ezra'],
  ['Neh', 'neh'], ['Esth', 'esth'], ['Job', 'job'], ['Ps', 'ps'], ['Prov', 'prov'], ['Eccl', 'eccl'],
  ['Song', 'song'], ['Lam', 'lam'], ['Isa', 'isa'], ['Jer', 'jer'], ['Ezek', 'ezek'], ['Dan', 'dan'],
  ['Hos', 'hos'], ['Joel', 'joel'], ['Amos', 'amos'], ['Obad', 'obad'], ['Jonah', 'jonah'], ['Mic', 'mic'],
  ['Nah', 'nah'], ['Hab', 'hab'], ['Zeph', 'zeph'], ['Hag', 'hag'], ['Zech', 'zech'], ['Mal', 'mal'],
] as const

const translationFiles: Record<string, number> = {
  gen: 1, exod: 2, lev: 3, num: 4, deut: 5, josh: 6, judg: 7,
  sam1: 8, sam2: 9, kgs1: 10, kgs2: 11, isa: 12, jer: 13, ezek: 14,
  hos: 15, joel: 16, amos: 17, obad: 18, jonah: 19, mic: 20, nah: 21,
  hab: 22, zeph: 23, hag: 24, zech: 25, mal: 26, ps: 27, prov: 28,
  job: 29, song: 30, ruth: 31, lam: 32, eccl: 33, esth: 34, dan: 35,
  ezra: 36, neh: 37, chr1: 38, chr2: 39,
}

type ImportedWord = { id: string; text: string; qere?: string; lemma: string; morphology: string; morphologyLabel?: string }
type ImportedVerse = { number: number; hebrew: string; punctuation: string; english?: string; words: ImportedWord[] }
type ImportedBook = Record<string, ImportedVerse[]>
type LexiconSense = { number?: string; stem?: string; text: string; references: string[]; senses?: LexiconSense[] }
type ImportedLexiconEntry = {
  id: string
  headword: string
  transliteration: string
  gloss: string
  definition: string
  morphology: string
  partOfSpeech: string[]
  senses: LexiconSense[]
  references: string[]
  strongs?: string
  twot?: string
  lexicalIndexId?: string
  bdbId?: string
  bdbRoot?: string
  etymology?: string
  lexicalRelationships?: Array<{ id: string; headword: string; transliteration: string; gloss: string }>
  bdbStatus?: string
}
type ImportedLexicon = Record<string, ImportedLexiconEntry>

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name) => ['div', 'chapter', 'verse', 'w', 'seg', 'entryFree', 'entry', 'part', 'xref', 'def', 'sense'].includes(name) })

function list(value: any): any[] { return value == null ? [] : Array.isArray(value) ? value : [value] }
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join('')
  return typeof value === 'string' ? value : value?.['#text'] ?? ''
}

function inlineText(value: any): string {
  if (Array.isArray(value)) return value.map(inlineText).join('')
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  return Object.entries(value)
    .filter(([key]) => !key.startsWith('@_') && key !== 'sense' && key !== 'ref')
    .map(([, child]) => inlineText(child))
    .join('')
}

/**
 * The entry's own headline definitions, e.g. for נָטָה:
 * "stretch out; spread out; extend; incline; bend".
 *
 * Deliberately excludes nested <sense> content. Folding senses in here made
 * the definition a near-duplicate of the sense list shown beneath it.
 */
function definitionText(entry: any): string {
  return list(entry.def).map(text).join('; ').replace(/\s+/g, ' ').trim()
}

/**
 * Some entries carry no top-level <def> and define themselves entirely
 * through their senses. Summarise those from the sense glosses rather than
 * leaving the definition empty, but never with a "Sense N:" prefix.
 */
function summariseFromSenses(senses: LexiconSense[]): string {
  const parts = senses.flatMap((sense) => [sense.text, ...(sense.senses ?? []).map((child) => child.text)])
  return [...new Set(parts.filter(Boolean))].join('; ')
}

/**
 * BDB senses are hierarchical: a verb entry groups senses by verbal stem
 * (Qal, Niph., Hiph.), and each stem may hold numbered and lettered
 * sub-senses. Flattening that structure lost the stem labels and produced
 * strings like "Sense 2: Spread out pitch; Sense 3: Bend turn incline".
 *
 * This preserves the tree so the reader can render it as an outline.
 */
function senseRecords(entry: any): LexiconSense[] {
  return list(entry.sense).map((sense) => {
    const stem = text(sense.stem).replace(/\s+/g, ' ').replace(/\.$/, '').trim()
    const definition = definitionText(sense)
    const children = senseRecords(sense)
    const record: LexiconSense = {
      ...(sense['@_n'] ? { number: String(sense['@_n']) } : {}),
      ...(stem ? { stem } : {}),
      text: definition,
      references: list(sense.ref).map((ref) => ref['@_r'] ?? inlineText(ref)).filter(Boolean),
      ...(children.length ? { senses: children } : {}),
    }
    return record
  // Keep a sense if it carries text, a stem label, or nested senses.
  }).filter((sense) => sense.text || sense.stem || sense.senses?.length)
}

function entryReferences(entry: any): string[] {
  return list(entry.ref).map((ref) => ref['@_r'] ?? inlineText(ref)).filter(Boolean)
}

function bdbRecord(entry: any) {
  const senses = senseRecords(entry)
  return {
    id: entry['@_id'],
    headword: inlineText(entry.w),
    partOfSpeech: list(entry.pos).map(inlineText).filter(Boolean),
    senses,
    // Entries without their own <def> define themselves through senses.
    definition: definitionText(entry) || summariseFromSenses(senses),
    references: entryReferences(entry),
    root: inlineText(entry.w),
    status: inlineText(entry.status),
  }
}

async function download(path: string) {
  const target = join(sourceDir, path)
  try { return await readFile(target, 'utf8') } catch { /* fetch below */ }
  const response = await fetch(`${baseUrl}/${path}`)
  if (!response.ok) throw new Error(`Could not fetch ${path}: ${response.status}`)
  const text = await response.text()
  await writeFile(target, text)
  return text
}

async function downloadLexicon(path: string) {
  const target = join(sourceDir, `lexicon-${path}`)
  try { return await readFile(target, 'utf8') } catch { /* fetch below */ }
  const response = await fetch(`${lexiconBase}/${path}`)
  if (!response.ok) throw new Error(`Could not fetch lexicon ${path}: ${response.status}`)
  const content = await response.text()
  await writeFile(target, content)
  return content
}

async function downloadMorphology(path: string) {
  const target = join(sourceDir, `morphology-${path}`)
  try { return await readFile(target, 'utf8') } catch { /* fetch below */ }
  const response = await fetch(`https://raw.githubusercontent.com/openscriptures/morphhb/${release}/parsing/${path}`)
  if (!response.ok) throw new Error(`Could not fetch morphology ${path}: ${response.status}`)
  const content = await response.text()
  await writeFile(target, content)
  return content
}

async function downloadTranslation(path: string) {
  const target = join(sourceDir, `translation-${path}`)
  try { return await readFile(target, 'utf8') } catch { /* fetch below */ }
  const response = await fetch(`${translationBase}/${path}`)
  if (!response.ok) throw new Error(`Could not fetch translation ${path}: ${response.status}`)
  const content = await response.text()
  await writeFile(target, content)
  return content
}

function normalizeAugmented(value: string) { return value.replaceAll('/', '').replaceAll(' ', '').toLowerCase() }
function lemmaKey(value: string) { return normalizeAugmented(value.split('/').at(-1) ?? value) }
function lexicalRelationshipIds(value: string | undefined) {
  if (!value) return []
  return value.replace(/^[^:]+:\s*/, '').split(',').map((item) => item.trim()).filter(Boolean)
}
/**
 * Normalises a JPS verse into plain text with explicit line structure.
 *
 * The source marks poetic lines with <po1>, <po2>, ... (13,724 occurrences
 * across the corpus) rather than <p1>. Matching only <p\d+> silently dropped
 * every poetic line break and ran the lines together without spaces.
 */
function cleanTranslation(value: string) {
  return value
    .replace(/<span[^>]*divineName[^>]*>(.*?)<\/span>/gi, (_, name) => `{{DIVINE_NAME}}${name}{{/DIVINE_NAME}}`)
    .replace(/<p\s*>/gi, '\n\n')
    // Poetic line markers: <po1> in this source, <p1> defensively.
    .replace(/<po?\d+\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // <rt> introduces a right-aligned marker such as Selah.
    .replace(/<rt\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
function first(value: any) { return Array.isArray(value) ? value[0] : value }
function collectEntries(value: any): any[] {
  if (!value || typeof value !== 'object') return []
  const found = value['@_id'] && (value.w || value.def) ? [value] : []
  return found.concat(Object.values(value).flatMap((child) => collectEntries(child)))
}

async function main() {
  await mkdir(output, { recursive: true })
  await mkdir(sourceDir, { recursive: true })
  const corpus: Record<string, ImportedBook> = {}
  let verseCount = 0
  let wordCount = 0
  const morphologyXml = parser.parse(await downloadMorphology('Oshm.xml'))
  const morphology: Record<string, string> = {}
  for (const entry of list(morphologyXml.TEI?.text?.body?.entryFree)) morphology[entry['@_n']] = text(entry).trim()
   const jpsBooks = new Map<number, any>()
   for (const fileNumber of new Set(Object.values(translationFiles))) jpsBooks.set(fileNumber, JSON5.parse(await downloadTranslation(`${fileNumber}.json`)))

  for (const [filename, bookId] of sourceBooks) {
    const xml = await download(`${filename}.xml`)
    const tree = parser.parse(xml)
    const book = tree.osis.osisText.div[0]
    const chapters = list(book.chapter)
    const imported: ImportedBook = {}
    for (const chapterNode of chapters) {
      const chapterNumber = Number(String(chapterNode['@_osisID']).split('.').at(-1))
      const chapterVerses: ImportedVerse[] = []
      for (const verseNode of list(chapterNode.verse)) {
        const qereByKetiv = new Map<string, any[]>()
        for (const note of list(verseNode.note)) {
          const qereWords = list(note.rdg).filter((reading: any) => reading['@_type'] === 'x-qere').flatMap((reading: any) => list(reading.w))
          if (qereWords.length) qereByKetiv.set(String(note.catchWord ?? '').replaceAll('/', ''), qereWords)
        }
        const words = list(verseNode.w).map((wordNode, index) => {
          const wordText = text(wordNode).replaceAll('/', '')
          const qereWord = wordNode['@_type'] === 'x-ketiv' ? qereByKetiv.get(wordText)?.[0] : undefined
          const qereText = qereWord ? text(qereWord).replaceAll('/', '') : undefined
          wordCount += 1
          const morphCode = wordNode['@_morph'] ?? ''
          return { id: wordNode['@_id'] ?? `${bookId}-${verseNode['@_osisID']}-${index}`, text: wordText, ...(qereText ? { qere: qereText } : {}), lemma: qereWord?.['@_lemma'] ?? wordNode['@_lemma'] ?? '', morphology: qereWord?.['@_morph'] ?? morphCode, morphologyLabel: morphology[qereWord?.['@_morph'] ?? morphCode] ?? (qereWord?.['@_morph'] ?? morphCode) }
        })
        const punctuation = list(verseNode.seg).map((part: any) => part['@_type'] === 'x-sof-pasuq' ? '׃' : text(part)).join('')
        const verseNumber = Number(String(verseNode['@_osisID']).split('.').at(-1))
         const translationBook = jpsBooks.get(translationFiles[bookId])
         const translationVerse = translationBook?.chapters?.[chapterNumber - 1]?.verses?.find((item: any) => item.verse === verseNumber)
         const translation = cleanTranslation(translationVerse?.text?.[0] ?? '')
         const hebrew = `${(words.map((word) => word.text).join(' ') + punctuation).replace(/[־׀]+׃$/, '׃').replace(/׃+$/, '')}׃`
         chapterVerses.push({ number: verseNumber, hebrew, punctuation, english: translation, words })
        verseCount += 1
      }
      imported[String(chapterNumber)] = chapterVerses
    }
    corpus[bookId] = imported
  }

  const lexicalXml = parser.parse(await downloadLexicon('LexicalIndex.xml'))
  const bdbXml = parser.parse(await downloadLexicon('BrownDriverBriggs.xml'))
  const bdbEntries = new Map<string, ReturnType<typeof bdbRecord>>()
  for (const entry of collectEntries(bdbXml.lexicon)) {
      const record = bdbRecord(entry)
      if (record.definition) bdbEntries.set(entry['@_id'], record)
    }
  const lexicalEntries = list(lexicalXml.index.part).flatMap((part: any) => list(part.entry))
  const byId = new Map<string, any>()
  for (const entry of lexicalEntries) {
    const word = first(entry.w)
    const xref = first(entry.xref)
    if (!word) continue
     const gloss = list(entry.def).map(text).join(' ').trim() || 'Lexical entry'
     const bdb = xref?.['@_bdb'] ? bdbEntries.get(xref['@_bdb']) : undefined
     const senses = bdb?.senses ?? []
     const references = [...new Set([
       ...(xref?.['@_strong'] ? [`Strong's H${xref['@_strong']}`] : []),
       ...(xref?.['@_twot'] ? [`TWOT ${xref['@_twot']}`] : []),
       ...(bdb?.references ?? []),
     ])]
     byId.set(entry['@_id'], {
       id: entry['@_id'],
       headword: text(word),
       transliteration: word['@_xlit'] ?? '',
       gloss,
       definition: bdb?.definition ?? gloss,
       morphology: word['@_pos'] ?? '',
       partOfSpeech: [...new Set([...(word['@_pos'] ? [word['@_pos']] : []), ...(bdb?.partOfSpeech ?? [])])],
       senses,
       references,
       strongs: xref?.['@_strong'] ? `H${xref['@_strong']}` : undefined,
       twot: xref?.['@_twot'],
       lexicalIndexId: entry['@_id'],
       bdbId: xref?.['@_bdb'],
       bdbRoot: bdb?.root,
       bdbStatus: bdb?.status,
       etymology: list(entry.etym).map((item) => `${item['@_type'] ? `${item['@_type']}: ` : ''}${text(item)}`).filter(Boolean).join('; ') || undefined,
     })
  }
  const augXml = parser.parse(await downloadLexicon('AugIndex.xml'))
  const lexicon: ImportedLexicon = {}
  for (const item of list(augXml.index.w)) {
    const code = text(item)
    const entry = byId.get(code)
     if (entry) lexicon[lemmaKey(item['@_aug'])] = entry
   }
   for (const entry of Object.values(lexicon)) {
     const relationshipIds = lexicalRelationshipIds(entry.etymology)
     entry.lexicalRelationships = relationshipIds.map((id) => byId.get(id)).filter(Boolean).map((related) => ({
       id: related.id,
       headword: related.headword,
       transliteration: related.transliteration,
       gloss: related.gloss,
     }))
     if (!entry.lexicalRelationships.length) delete entry.lexicalRelationships
   }

  const manifest = { status: 'imported', source: 'Open Scriptures Hebrew Bible', release, sourceUrl: `https://github.com/openscriptures/morphhb/tree/${release}`, sha256: createHash('sha256').update(JSON.stringify(corpus)).digest('hex'), books: sourceBooks.length, verses: verseCount, words: wordCount }
  await writeFile(join(output, 'oshb-corpus.json'), JSON.stringify(corpus))
  await writeFile(join(output, 'oshb-lexicon.json'), JSON.stringify(lexicon))
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Imported ${sourceBooks.length} books, ${verseCount} verses, and ${wordCount} words.`)
}

void main()
