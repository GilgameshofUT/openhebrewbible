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

// The citation map ends these Jewish verses at a Christian verse that does not
// exist in the editions (Christian Numbers 25 ends at 18, 1 Chr 12 at 40, and
// the Christian Psalms number one fewer verse than the Jewish). The KJV join
// has exactly the same five gaps, so empty text here is expected, not a bug.
const KNOWN_GAPS = new Set(['num:25:19', 'chr1:12:41', 'ps:52:11', 'ps:75:11', 'ps:142:8'])

maybe('committed translations', () => {
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus

  for (const id of ['web', 'ylt', 'bsb'] as const) {
    it(`${id} covers every corpus verse except the five citation-map gaps`, () => {
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
            if (KNOWN_GAPS.has(key)) {
              expect(stored!.text, `${id} ${key} is a known citation-map gap`).toBe('')
            } else {
              expect(stored!.text.length, `${id} ${key} should have text`).toBeGreaterThan(0)
            }
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

  it('sct covers only the books Sefaria has translated', () => {
    const files = readdirSync(join(sourcesDir, 'sct')).filter((file) => file.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    expect(files.length).toBeLessThan(books.length)
    expect(files).toContain('Genesis.json')
    expect(files).toContain('Psalms.json')
    // Books with no Sefaria Community Translation text.
    expect(files).not.toContain('Ruth.json')
    expect(files).not.toContain('Hosea.json')

    const gen = readBook('sct', 'Genesis')
    const gen1v1 = gen.chapters[0].verses.find((item) => item.verse === '1')!
    expect(gen1v1.text.length).toBeGreaterThan(0)
  })
})

describe('translation registry', () => {
  it('lists all six translations with unique ids', () => {
    expect(TRANSLATIONS.map((translation) => translation.id)).toEqual(['jps', 'kjv', 'web', 'ylt', 'bsb', 'sct'])
    expect(new Set(TRANSLATIONS.map((translation) => translation.id)).size).toBe(6)
    expect(TRANSLATIONS.filter((translation) => translation.embedded)).toHaveLength(1)
    for (const translation of TRANSLATIONS) {
      expect(translation.label.length).toBeGreaterThan(0)
      expect(translation.shortLabel.length).toBeGreaterThan(0)
    }
  })

  it('resolves labels and rejects unknown ids', () => {
    expect(translationLabel('bsb')).toBe('Berean Standard Bible')
    expect(translationShortLabel('sct')).toBe('SCT')
    expect(isTranslationId('niv')).toBe(false)
    expect(isTranslationId('ylt')).toBe(true)
  })
})

describe('joinTranslation', () => {
  const christian = TRANSLATIONS.find((translation) => translation.id === 'bsb')!
  const jewish = TRANSLATIONS.find((translation) => translation.id === 'sct')!

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
