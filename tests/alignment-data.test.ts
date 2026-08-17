/**
 * Data-shape tests for the karaoke alignment files.
 *
 * These files are curated derived data: a timestamp bug here is invisible to
 * typecheck, lint, and component tests, and would show up only as a broken
 * highlight on the rendered page.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const alignmentDir = join(process.cwd(), 'data', 'external', 'word-alignment')
const mechonAlignmentDir = join(process.cwd(), 'data', 'external', 'word-alignment-mechon')
const booksDir = join(process.cwd(), 'data', 'generated', 'books')
const booksPath = join(booksDir, 'gen.json')
const coveragePath = join(alignmentDir, 'gen-1.json')
const derived = existsSync(alignmentDir) && existsSync(booksPath) && existsSync(coveragePath)
const maybe = derived ? describe : describe.skip
const mechonPresent = existsSync(mechonAlignmentDir) && existsSync(join(mechonAlignmentDir, 'gen-1.json'))
const maybeMechon = mechonPresent ? describe : describe.skip

type AlignedWord = { id: string; start: number; end: number }
type BookChapters = Record<string, Array<{ words: Array<{ id: string }> }>>

// Books present in data/generated/books, from src/lib/books.ts.
const bookIds = [
  'gen', 'exod', 'lev', 'num', 'deut', 'josh', 'judg', 'sam1', 'sam2', 'kgs1', 'kgs2',
  'isa', 'jer', 'ezek', 'hos', 'joel', 'amos', 'obad', 'jonah', 'mic', 'nah', 'hab',
  'zeph', 'hag', 'zech', 'mal', 'ps', 'prov', 'job', 'song', 'ruth', 'lam', 'eccl',
  'esth', 'dan', 'ezra', 'neh', 'chr1', 'chr2',
]

function readAlignment(book: string, chapter: string): { words: AlignedWord[] } {
  return JSON.parse(readFileSync(join(alignmentDir, `${book}-${chapter}.json`), 'utf8'))
}

function readMechonAlignment(book: string, chapter: string): { words: AlignedWord[] } {
  return JSON.parse(readFileSync(join(mechonAlignmentDir, `${book}-${chapter}.json`), 'utf8'))
}

function readBook(book: string): BookChapters {
  return JSON.parse(readFileSync(join(booksDir, `${book}.json`), 'utf8'))
}

function corpusIds(book: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const [chapter, verses] of Object.entries(readBook(book))) {
    for (const verse of verses) {
      for (const word of verse.words) result.set(word.id, chapter)
    }
  }
  return result
}

maybe('word alignment data covers the whole corpus', () => {
  it('has exactly one alignment file per chapter of every book', () => {
    for (const book of bookIds) {
      const chapters = readBook(book)
      for (const chapter of Object.keys(chapters)) {
        expect(existsSync(join(alignmentDir, `${book}-${chapter}.json`)), `${book}-${chapter}`).toBe(true)
      }
    }
  })

  it('references every OSHB word id exactly once, with per-chapter counts matching the corpus', () => {
    for (const book of bookIds) {
      const ids = corpusIds(book)
      const seen = new Set<string>()
      for (const [chapter, verses] of Object.entries(readBook(book))) {
        const expected = verses.reduce((sum, verse) => sum + verse.words.length, 0)
        const alignment = readAlignment(book, chapter)
        expect(alignment.words.length, `${book}-${chapter} word count`).toBe(expected)
        for (const word of alignment.words) {
          expect(ids.has(word.id), `unknown word id ${book}-${chapter}:${word.id}`).toBe(true)
          expect(seen.has(word.id), `duplicate word id ${book}-${chapter}:${word.id}`).toBe(false)
          seen.add(word.id)
        }
      }
      expect(seen.size, `${book} total words`).toBe(ids.size)
    }
  })

  it('is monotonic and ascending in every chapter', () => {
    for (const book of bookIds) {
      for (const chapter of Object.keys(readBook(book))) {
        const words = readAlignment(book, chapter).words
        let previousEnd = 0
        for (const word of words) {
          expect(word.start, `start of ${book}-${chapter}:${word.id}`).toBeGreaterThanOrEqual(previousEnd)
          expect(word.end, `end of ${book}-${chapter}:${word.id}`).toBeGreaterThan(word.start)
          previousEnd = word.end
        }
      }
    }
  })
})

maybeMechon('mechon word alignment data covers the whole corpus', () => {
  it('has exactly one alignment file per chapter of every book', () => {
    for (const book of bookIds) {
      const chapters = readBook(book)
      for (const chapter of Object.keys(chapters)) {
        expect(existsSync(join(mechonAlignmentDir, `${book}-${chapter}.json`)), `${book}-${chapter}`).toBe(true)
      }
    }
  })

  it('references every OSHB word id exactly once, with per-chapter counts matching the corpus', () => {
    for (const book of bookIds) {
      const ids = corpusIds(book)
      const seen = new Set<string>()
      for (const [chapter, verses] of Object.entries(readBook(book))) {
        const expected = verses.reduce((sum, verse) => sum + verse.words.length, 0)
        const alignment = readMechonAlignment(book, chapter)
        expect(alignment.words.length, `${book}-${chapter} word count`).toBe(expected)
        for (const word of alignment.words) {
          expect(ids.has(word.id), `unknown word id ${book}-${chapter}:${word.id}`).toBe(true)
          expect(seen.has(word.id), `duplicate word id ${book}-${chapter}:${word.id}`).toBe(false)
          seen.add(word.id)
        }
      }
      expect(seen.size, `${book} total words`).toBe(ids.size)
    }
  })

  it('is monotonic and ascending in every chapter', () => {
    for (const book of bookIds) {
      for (const chapter of Object.keys(readBook(book))) {
        const words = readMechonAlignment(book, chapter).words
        let previousEnd = 0
        for (const word of words) {
          expect(word.start, `start of ${book}-${chapter}:${word.id}`).toBeGreaterThanOrEqual(previousEnd)
          expect(word.end, `end of ${book}-${chapter}:${word.id}`).toBeGreaterThan(word.start)
          previousEnd = word.end
        }
      }
    }
  })
})