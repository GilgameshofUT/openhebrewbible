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
        const verseWordNodes = list(verseNode.w)
        // Build qere assignments by matching catchWord phrases to verse word sequences.
        // Handles 1-to-N splits (e.g. מאשתם → מֵאֵשׁ תַּם), N-to-1 merges
        // (e.g. חרי יונים → דִּבְיוֹנִים), and N-to-N phrases where the catch
        // includes a preceding normal word (Job 38:1 מנ ה/סערה → מִן הַסְּעָרָה).
        const normalizeForMatch = (value: string) =>
          value.replaceAll('/', '').replace(/[\u0591-\u05C7]/g, '').replaceAll('־', ' ').trim().replace(/\s+/g, ' ')
        const cleanQere = (value: string) => value.replaceAll('/', '').trim()
        const assignments = new Map<number, { qereText: string; qereNode: any }>()
        const verseNorms = verseWordNodes.map((w: any) => normalizeForMatch(text(w)))
        for (const note of list(verseNode.note)) {
          const rdgs = list(note.rdg).filter((r: any) => r['@_type'] === 'x-qere')
          if (!rdgs.length) continue
          const qereNodes: any[] = rdgs.flatMap((r: any) => list(r.w))
          if (!qereNodes.length) continue
          const qereTexts = qereNodes.map((w: any) => cleanQere(text(w)))
          const hasPaseq = rdgs.some((r: any) => list((r as any).seg).some((s: any) => s['@_type'] === 'x-paseq'))
          const catchRaw = String((note as any).catchWord ?? '')
          const catchClean = catchRaw.replaceAll('/', '').replaceAll('־', ' ')
          const catchTokens = catchClean.trim().split(/\s+/).filter(Boolean).map((t) => normalizeForMatch(t))
          if (!catchTokens.length) continue
          const catchConcat = catchTokens.map((t) => t.replace(/\s+/g, '')).join('')
          let matchStart = -1
          let matchLen = 0
          // Prefer token-wise match
          for (let i = 0; i <= verseNorms.length - catchTokens.length; i++) {
            let ok = true
            for (let j = 0; j < catchTokens.length; j++) if (verseNorms[i + j] !== catchTokens[j]) { ok = false; break }
            if (ok) { matchStart = i; matchLen = catchTokens.length; break }
          }
          // Fallback: concatenated match (e.g. חרי+יונים = חרייונים)
          if (matchStart === -1) {
            const verseConcats = verseNorms.map((v) => v.replace(/\s+/g, ''))
            for (let i = 0; i < verseNorms.length; i++) {
              for (let L = 1; L <= 3 && i + L <= verseNorms.length; L++) {
                const concat = verseConcats.slice(i, i + L).join('')
                if (concat === catchConcat) { matchStart = i; matchLen = L; break }
              }
              if (matchStart !== -1) break
            }
          }
          if (matchStart === -1) continue
          // Distribute qere to verse words in the window
          if (matchLen === qereNodes.length) {
            for (let j = 0; j < matchLen; j++) {
              assignments.set(matchStart + j, { qereText: qereTexts[j], qereNode: qereNodes[j] })
            }
          } else if (matchLen === 1 && qereNodes.length > 1) {
            const joined = hasPaseq ? qereTexts.join(' ׀ ') : qereTexts.join(' ')
            assignments.set(matchStart, { qereText: joined, qereNode: qereNodes[0] })
          } else if (qereNodes.length === 1 && matchLen > 1) {
            // Merge: multiple written words → single read word
            // Assign to the last ketiv word in the window (or last word)
            let target = -1
            for (let j = matchLen - 1; j >= 0; j--) {
              if (verseWordNodes[matchStart + j]['@_type'] === 'x-ketiv') { target = matchStart + j; break }
            }
            if (target === -1) target = matchStart + matchLen - 1
            assignments.set(target, { qereText: qereTexts[0], qereNode: qereNodes[0] })
          } else {
            // Mismatched counts: join qere and assign to last ketiv
            const joined = hasPaseq ? qereTexts.join(' ׀ ') : qereTexts.join(' ')
            let target = -1
            for (let j = matchLen - 1; j >= 0; j--) {
              if (verseWordNodes[matchStart + j]['@_type'] === 'x-ketiv') { target = matchStart + j; break }
            }
            if (target === -1) target = matchStart + matchLen - 1
            assignments.set(target, { qereText: joined, qereNode: qereNodes[0] })
          }
        }
        const words = verseWordNodes.map((wordNode: any, index: number) => {
          const wordText = text(wordNode).replaceAll('/', '')
          const assignment = assignments.get(index)
          const qereText = assignment?.qereText
          const qereNode = assignment?.qereNode
          wordCount += 1
          const morphCode = wordNode['@_morph'] ?? ''
          const lemma = qereNode?.['@_lemma'] ?? wordNode['@_lemma'] ?? ''
          const morph = qereNode?.['@_morph'] ?? morphCode
          return {
            id: wordNode['@_id'] ?? `${bookId}-${verseNode['@_osisID']}-${index}`,
            text: wordText,
            ...(qereText ? { qere: qereText } : {}),
            lemma,
            morphology: morph,
            morphologyLabel: morphology[morph] ?? morph,
          }
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
