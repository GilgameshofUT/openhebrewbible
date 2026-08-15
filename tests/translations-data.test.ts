import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { books } from '@/lib/books'
import {
  TRANSLATIONS,
  isTranslationId,
  joinTranslation,
  translationLabel,
  translationShortLabel,
} from '@/lib/translations'

const root = process.cwd()
const corpusPath = join(root, 'data', 'generated', 'oshb-corpus.json')
const sourcesDir = join(root, 'data', 'sources')
const derived = existsSync(corpusPath)
const maybe = derived ? describe : describe.skip

type Corpus = Record<string, Record<string, Array<{ number: number }>>>

function readBook(translationId: string, kjvFile: string) {
  return JSON.parse(readFileSync(join(sourcesDir, translationId, `${kjvFile}.json`), 'utf8')) as {
    book: string
    chapters: Array<{ chapter: string; verses: Array<{ verse: string; text: string }> }>
  }
}

// The citation map used to end some Jewish verses at Christian verses that
// do not exist in the editions (Christian Numbers 25 ends at 18, 1 Chr 12 at
// 40, and the Christian Psalms number the superscription differently). Those
// were fixed in the Hebrew-Citation-Converter repo: every citation-map target
// now exists in the editions, so every corpus verse has text.
const FIXED_VERSE_TEXT: Array<[string, string, string]> = [
  ['num:25:19', 'Numbers', 'plague'], // Jewish 25:19 = Christian Num 26:1
  ['chr1:12:6', '1Chronicles', 'Eluzai'], // offset from Jewish 12:5 onward
  ['neh:7:68', 'Nehemiah', 'camels'], // Christian inserts the horses/mules verse
  ['ps:52:3', 'Psalms', 'boast'], // d=2 front merge
  ['ps:52:11', 'Psalms', 'I will praise'], // last Jewish verse -> last Christian verse
  ['ps:75:11', 'Psalms', 'horns'], // psalm was missing from the table entirely
  ['ps:142:8', 'Psalms', 'prison'], // last verse fell through to identity
]

maybe('committed translations', () => {
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus

  for (const id of ['web', 'ylt', 'bsb'] as const) {
    it(`${id} covers every corpus verse`, () => {
      const files = readdirSync(join(sourcesDir, id)).filter((file) => file.endsWith('.json'))
      expect(files).toHaveLength(books.length)
      for (const book of books) {
        const data = readBook(id, book.kjvFile)
        expect(data.book).toBe(book.name)
        const chapters = corpus[book.id]
        for (const [chapter, verses] of Object.entries(chapters)) {
          const chapterData = data.chapters.find((item) => item.chapter === chapter)
          expect(chapterData, `${id} ${book.id} ${chapter}`).toBeDefined()
          expect(chapterData!.verses).toHaveLength(verses.length)
          for (const verse of verses) {
            const key = `${book.id}:${chapter}:${verse.number}`
            const stored = chapterData!.verses.find((item) => item.verse === String(verse.number))
            expect(stored, `${id} ${key}`).toBeDefined()
            expect(stored!.text.length, `${id} ${key} should have text`).toBeGreaterThan(0)
          }
        }
      }
    })
  }

  it('converts known divergent verses correctly', () => {
    const joel = readBook('bsb', 'Joel')
    const joel4v1 = joel.chapters.find((item) => item.chapter === '4')!.verses.find((item) => item.verse === '1')!
    expect(joel4v1.text.length).toBeGreaterThan(0)

    const ps = readBook('bsb', 'Psalms')
    const ps22v2 = ps.chapters.find((item) => item.chapter === '22')!.verses.find((item) => item.verse === '2')!
    expect(ps22v2.text).toContain('My God, my God')
  })

  it('fixes the citation-map verses that were previously empty or offset', () => {
    for (const [key, kjvFile, needle] of FIXED_VERSE_TEXT) {
      const [, chapter, verse] = key.split(':')
      const data = readBook('bsb', kjvFile)
      const stored = data.chapters.find((item) => item.chapter === chapter)!.verses.find((item) => item.verse === verse)!
      expect(stored.text.length, key).toBeGreaterThan(0)
      expect(stored.text.toLowerCase(), key).toContain(needle.toLowerCase())
    }
  })
})

describe('chapter payload stays lean', () => {
  // Regression: the chapter API used to embed the full BDB entry (with its
  // senses tree) for every word, making Psalm 119 a 1.25 MB response. Entries
  // are fetched on demand from /api/lexicon for the selected word only.
  it('does not embed the lexicon entry in chapter responses', () => {
    const route = readFileSync(join(root, 'src', 'app', 'api', 'chapter', 'route.ts'), 'utf8')
    expect(route).toContain('lexiconId')
    expect(route).not.toContain('lexicon: entry')
  })

  it('serves entries on demand via /api/lexicon', () => {
    const route = readFileSync(join(root, 'src', 'app', 'api', 'lexicon', 'route.ts'), 'utf8')
    expect(route).toContain("params.get('id')")
    expect(route).toContain('getLexicon')
  })
})

describe('translation registry', () => {
  it('lists all five translations with unique ids', () => {
    expect(TRANSLATIONS.map((translation) => translation.id)).toEqual(['jps', 'kjv', 'web', 'ylt', 'bsb'])
    expect(new Set(TRANSLATIONS.map((translation) => translation.id)).size).toBe(5)
    expect(TRANSLATIONS.filter((translation) => translation.embedded)).toHaveLength(1)
    for (const translation of TRANSLATIONS) {
      expect(translation.label.length).toBeGreaterThan(0)
      expect(translation.shortLabel.length).toBeGreaterThan(0)
    }
  })

  it('resolves labels and rejects unknown ids', () => {
    expect(translationLabel('bsb')).toBe('Berean Standard Bible')
    expect(translationShortLabel('web')).toBe('WEB')
    expect(isTranslationId('sct')).toBe(false)
    expect(isTranslationId('niv')).toBe(false)
    expect(isTranslationId('ylt')).toBe(true)
  })
})

describe('joinTranslation', () => {
  const christian = TRANSLATIONS.find((translation) => translation.id === 'bsb')!
  const jewish = TRANSLATIONS.find((translation) => translation.id === 'jps')!

  it('looks up text directly by the corpus chapter/verse key', () => {
    const text = new Map([['1:1', 'In the beginning…']])
    expect(joinTranslation(1, 1, christian, text).english).toBe('In the beginning…')
    expect(joinTranslation(2, 1, christian, text).english).toBe('')
  })

  it('attaches the edition reference for Christian-system editions', () => {
    expect(joinTranslation(2, 22, christian, new Map([['22:2', 'x']]), { book: 'Ps', chapter: 22, verse: 1 })).toEqual({
      english: 'x',
      englishReference: 'Ps 22:1',
    })
  })

  it('does not attach a reference for Jewish-system editions', () => {
    expect(joinTranslation(2, 22, jewish, new Map([['22:2', 'x']]), { book: 'Ps', chapter: 22, verse: 1 })).toEqual({
      english: 'x',
    })
  })
})
