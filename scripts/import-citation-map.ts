import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const outputDir = join(root, 'data', 'generated')
const converterUrl = 'https://raw.githubusercontent.com/GilgameshofUT/Hebrew-Citation-Converter/main/jewish-christian-verse-convert.py'

const books = [
  ['gen', 'Gen'], ['exod', 'Ex'], ['lev', 'Lev'], ['num', 'Num'], ['deut', 'Deut'], ['josh', 'Josh'], ['judg', 'Judg'], ['ruth', 'Ruth'],
  ['sam1', '1Sam'], ['sam2', '2Sam'], ['kgs1', '1Kings'], ['kgs2', '2Kings'], ['chr1', '1Chr'], ['chr2', '2Chr'], ['ezra', 'Ezra'], ['neh', 'Neh'],
  ['esth', 'Esth'], ['job', 'Job'], ['ps', 'Ps'], ['prov', 'Prov'], ['eccl', 'Eccl'], ['song', 'Song'], ['lam', 'Lam'], ['isa', 'Isa'], ['jer', 'Jer'],
  ['ezek', 'Ezek'], ['dan', 'Dan'], ['hos', 'Hos'], ['joel', 'Joel'], ['amos', 'Am'], ['obad', 'Ob'], ['jonah', 'Jon'], ['mic', 'Mic'], ['nah', 'Nah'],
  ['hab', 'Hab'], ['zeph', 'Zeph'], ['hag', 'Hag'], ['zech', 'Zech'], ['mal', 'Mal'],
] as const

const bookIds = new Map(books.map(([id, name]) => [name, id]))

type Reference = { book: string; chapter: number; verse: number }

async function main() {
  const converter = await fetch(converterUrl).then((response) => response.text())
  const exceptions = new Map<string, Reference>()
  const pattern = /\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*:\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g
  for (const match of converter.matchAll(pattern)) {
    const jewish: Reference = { book: match[1], chapter: Number(match[2]), verse: Number(match[3]) }
    exceptions.set(`${match[1]}:${match[2]}:${match[3]}`, { book: match[4], chapter: Number(match[5]), verse: Number(match[6]) })
  }

  const corpus = JSON.parse(await readFile(join(root, 'data', 'generated', 'oshb-corpus.json'), 'utf8')) as Record<string, Record<string, Array<{ number: number }>>>
  const jewishToChristian: Record<string, Reference> = {}
  for (const [bookId, chapters] of Object.entries(corpus)) {
    const christianBook = books.find(([id]) => id === bookId)?.[1]
    if (!christianBook) continue
    for (const [chapter, verses] of Object.entries(chapters)) for (const verse of verses) {
      const jewishKey = `${christianBook}:${chapter}:${verse.number}`
      const mapped = exceptions.get(jewishKey)
      const christian = mapped ?? { book: christianBook, chapter: Number(chapter), verse: verse.number }
      jewishToChristian[`${bookId}:${chapter}:${verse.number}`] = christian
    }
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, 'jewish-to-christian-citation-map.json'), `${JSON.stringify({ source: converterUrl, generatedAt: new Date().toISOString(), jewishToChristian }, null, 2)}\n`)
  console.log(`Generated ${Object.keys(jewishToChristian).length} Jewish-to-Christian verse mappings.`)
}

void main()
