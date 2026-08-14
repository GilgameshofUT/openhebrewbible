/**
 * Re-applies the JPS translation text to the imported corpus from the cached
 * source files in data/sources, without re-running the network import.
 *
 * The original import matched only <p\d+> line markers, but the JPS source
 * uses <po1>, <po2>, ... (13,724 occurrences). Every poetic line break was
 * dropped, which ran lines together with no separating space:
 *
 *   "...that heweth therewith?Should the saw magnify..."
 *
 * This rewrites oshb-corpus.json in place using the corrected normaliser,
 * then the derived per-book files must be rebuilt.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSON5 from 'json5'

const root = process.cwd()
const generated = join(root, 'data', 'generated')
const sourceDir = join(root, 'data', 'sources')

const translationFiles: Record<string, number> = {
  gen: 1, exod: 2, lev: 3, num: 4, deut: 5, josh: 6, judg: 7,
  sam1: 8, sam2: 9, kgs1: 10, kgs2: 11, isa: 12, jer: 13, ezek: 14,
  hos: 15, joel: 16, amos: 17, obad: 18, jonah: 19, mic: 20, nah: 21,
  hab: 22, zeph: 23, hag: 24, zech: 25, mal: 26, ps: 27, prov: 28,
  job: 29, song: 30, ruth: 31, lam: 32, eccl: 33, esth: 34, dan: 35,
  ezra: 36, neh: 37, chr1: 38, chr2: 39,
}

/** Mirrors cleanTranslation in scripts/import-oshb.ts. */
function cleanTranslation(value: string) {
  return value
    .replace(/<span[^>]*divineName[^>]*>(.*?)<\/span>/gi, (_, name: string) => `{{DIVINE_NAME}}${name}{{/DIVINE_NAME}}`)
    .replace(/<p\s*>/gi, '\n\n')
    .replace(/<po?\d+\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
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

type Verse = { number: number; english?: string }
type Corpus = Record<string, Record<string, Verse[]>>
type TranslationChapter = { verses?: Array<{ verse: number; text?: string[] }> }
type TranslationBook = { chapters?: TranslationChapter[] }

async function main() {
  const corpus = JSON.parse(await readFile(join(generated, 'oshb-corpus.json'), 'utf8')) as Corpus

  const cache = new Map<number, TranslationBook>()
  for (const fileNumber of new Set(Object.values(translationFiles))) {
    const raw = await readFile(join(sourceDir, `translation-${fileNumber}.json`), 'utf8')
    cache.set(fileNumber, JSON5.parse(raw) as TranslationBook)
  }

  let updated = 0
  let withBreaks = 0

  for (const [bookId, chapters] of Object.entries(corpus)) {
    const translation = cache.get(translationFiles[bookId])
    if (!translation) continue
    for (const [chapter, verses] of Object.entries(chapters)) {
      const chapterIndex = Number(chapter) - 1
      for (const verse of verses) {
        const match = translation.chapters?.[chapterIndex]?.verses?.find((item) => item.verse === verse.number)
        const text = cleanTranslation(match?.text?.[0] ?? '')
        if (text !== verse.english) updated += 1
        if (text.includes('\n')) withBreaks += 1
        verse.english = text
      }
    }
  }

  await writeFile(join(generated, 'oshb-corpus.json'), JSON.stringify(corpus))
  console.log(`Updated ${updated} verses; ${withBreaks} now carry explicit line breaks.`)
  console.log('Run `npm run build:derived` to refresh the per-book files.')
}

void main()
