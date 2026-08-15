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

const alignmentPath = join(process.cwd(), 'data', 'external', 'word-alignment', 'gen-1.json')
const booksPath = join(process.cwd(), 'data', 'generated', 'books', 'gen.json')
const derived = existsSync(alignmentPath) && existsSync(booksPath)
const maybe = derived ? describe : describe.skip

type AlignedWord = { id: string; start: number; end: number }

maybe('word alignment data', () => {
  const alignment = JSON.parse(readFileSync(alignmentPath, 'utf8')) as { book: string; chapter: number; words: AlignedWord[] }
  const gen = JSON.parse(readFileSync(booksPath, 'utf8')) as Record<string, Array<{ words: Array<{ id: string }> }>>
  const oshbIds = new Set(gen['1'].flatMap((verse) => verse.words.map((word) => word.id)))

  it('references OSHB word ids that exist in Genesis 1', () => {
    expect(alignment.words.length).toBeGreaterThan(0)
    for (const word of alignment.words) {
      expect(oshbIds.has(word.id), `unknown word id ${word.id}`).toBe(true)
    }
  })

  it('is monotonic: each word starts after the previous one ends', () => {
    let previousEnd = 0
    for (const word of alignment.words) {
      expect(word.start, `start of ${word.id}`).toBeGreaterThanOrEqual(previousEnd)
      expect(word.end, `end of ${word.id}`).toBeGreaterThan(word.start)
      previousEnd = word.end
    }
  })

  it('stays within the chapter audio length', () => {
    const last = alignment.words[alignment.words.length - 1]
    expect(last.end).toBeLessThan(292_000)
  })
})
