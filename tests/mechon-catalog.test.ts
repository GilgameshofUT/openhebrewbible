/**
 * Data-shape test for the Mechon Mamre chapter-audio catalog.
 *
 * The catalog maps each chapter target to a mechon-mamre.org MP3 URL. The URL
 * encodes the book as a two-digit block (in the site's own Leningrad-order
 * numbering) plus the chapter. The book-block table was wrong for the six
 * Ketuvim books — Job/Proverbs, Ruth/Song of Songs, Ecclesiastes/Lamentations
 * were each swapped — so the app served the wrong reading for an entire book.
 *
 * This pins the mapping so a future bad edit fails without needing a network
 * fetch. The five-letter + digit book ids come from src/lib/books.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type CatalogResource = { id: string; url: string; targets: string[] }

const catalogPath = join(process.cwd(), 'data', 'external', 'mechon-mamre-chapter-audio.json')

function load(): { resources: CatalogResource[] } {
  return JSON.parse(readFileSync(catalogPath, 'utf8'))
}

/** Verified by transcribing the opening of each book's first chapter. */
const bookBlocks: Record<string, string> = {
  job: '27', prov: '28', ruth: '29', song: '30', eccl: '31', lam: '32',
}

describe('mechon mamre catalog book-block mapping', () => {
  const catalog = load()
  const resources = catalog.resources.filter((resource) => resource.targets.some((target) => target.startsWith('chapter:')))

  it('maps each Job/Proverbs/Ruth/Song/Eccl/Lam chapter to the correct MP3 block', () => {
    for (const [bookId, block] of Object.entries(bookBlocks)) {
      const rows = resources
        .filter((resource) => resource.targets[0] === `chapter:${bookId}:1` || resource.targets[0] === `chapter:${bookId}:2`)
      expect(rows.length, `${bookId} needs at least two chapter entries to argue about`).toBeGreaterThan(1)
      for (const row of rows) {
        const chapter = row.targets[0].split(':')[2]
        const expected = `https://mechon-mamre.org/mp3/t${block}${chapter.padStart(2, '0')}.mp3`
        expect(row.url, `chapter target ${row.targets[0]}`).toBe(expected)
      }
    }
  })

  it('covers exactly the real chapter count of each of those books', () => {
    const realCounts: Record<string, number> = { job: 42, prov: 31, ruth: 4, song: 8, eccl: 12, lam: 5 }
    for (const [bookId, count] of Object.entries(realCounts)) {
      const rows = resources.filter((resource) => resource.targets[0].startsWith(`chapter:${bookId}:`))
      expect(rows.length, `${bookId} resource count`).toBe(count)
    }
  })
})