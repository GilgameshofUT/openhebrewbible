import { describe, expect, it } from 'vitest'
import { books, findBook, parseReference, validateBookChapter } from '@/lib/books'

describe('findBook', () => {
  it('matches full English names case-insensitively', () => {
    expect(findBook('Genesis')?.id).toBe('gen')
    expect(findBook('genesis')?.id).toBe('gen')
    expect(findBook('  GENESIS  ')?.id).toBe('gen')
  })

  it('matches abbreviations', () => {
    expect(findBook('Gen')?.id).toBe('gen')
    expect(findBook('gn')?.id).toBe('gen')
    expect(findBook('1sam')?.id).toBe('sam1')
    expect(findBook('2ch')?.id).toBe('chr2')
  })

  it('matches Hebrew names', () => {
    expect(findBook('בראשית')?.id).toBe('gen')
    expect(findBook('תהילים')?.id).toBe('ps')
  })

  it('ignores periods, apostrophes, and internal spacing', () => {
    expect(findBook('1 Sam.')?.id).toBe('sam1')
    expect(findBook('Song of Songs')?.id).toBe('song')
    expect(findBook('songofsongs')?.id).toBe('song')
  })

  it('returns undefined for unknown input', () => {
    expect(findBook('Matthew')).toBeUndefined()
    expect(findBook('')).toBeUndefined()
    expect(findBook('zzz')).toBeUndefined()
  })
})

describe('parseReference', () => {
  it('parses book, chapter, and verse', () => {
    expect(parseReference('Gen 1:1')).toMatchObject({ chapter: 1, verse: 1 })
    expect(parseReference('Genesis 1:1')?.book.id).toBe('gen')
  })

  it('parses a chapter without a verse', () => {
    const parsed = parseReference('Isaiah 9')
    expect(parsed?.book.id).toBe('isa')
    expect(parsed?.chapter).toBe(9)
    expect(parsed?.verse).toBeUndefined()
  })

  it('defaults to chapter 1 when only a book is given', () => {
    expect(parseReference('Obadiah')).toMatchObject({ chapter: 1 })
  })

  it('rejects out-of-range chapters', () => {
    // Obadiah has exactly one chapter.
    expect(parseReference('Obadiah 2')).toBeUndefined()
    expect(parseReference('Genesis 51')).toBeUndefined()
    expect(parseReference('Genesis 0')).toBeUndefined()
  })

  it('rejects unknown books', () => {
    expect(parseReference('Matthew 1:1')).toBeUndefined()
  })
})

describe('validateBookChapter', () => {
  it('accepts a valid book and chapter', () => {
    const result = validateBookChapter('gen', '1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.book.id).toBe('gen')
  })

  it('rejects a missing book', () => {
    expect(validateBookChapter(null, '1')).toMatchObject({ ok: false })
  })

  it('rejects an unknown book rather than passing it to a file path', () => {
    const result = validateBookChapter('../../etc/passwd', '1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Unknown book')
  })

  it('rejects a non-integer chapter instead of producing NaN', () => {
    const result = validateBookChapter('gen', 'abc')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not an integer')
  })

  it('rejects an out-of-range chapter', () => {
    const result = validateBookChapter('obad', '2')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('out of range')
  })
})

describe('book table integrity', () => {
  it('has 39 books with unique ids', () => {
    expect(books).toHaveLength(39)
    expect(new Set(books.map((book) => book.id)).size).toBe(39)
  })

  it('gives every book a positive chapter count and a KJV filename', () => {
    for (const book of books) {
      expect(book.chapters).toBeGreaterThan(0)
      expect(book.kjvFile).not.toBe('')
    }
  })
})
