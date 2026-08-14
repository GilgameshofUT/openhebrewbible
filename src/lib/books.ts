/**
 * Canonical book identity, shared by the client reader and the API routes.
 *
 * The API validates incoming `book` and `chapter` parameters against this
 * list so an unknown id can never reach a file path or an outbound URL.
 */
export type Division = 'Torah' | 'Nevi\'im' | 'Ketuvim'

export type Book = {
  id: string
  name: string
  hebrewName: string
  abbreviations: string[]
  division: Division
  chapters: number
  /** Base filename in data/sources/kjv. */
  kjvFile: string
}

export const books: Book[] = [
  { id: 'gen', name: 'Genesis', hebrewName: 'בראשית', abbreviations: ['gen', 'gn', 'ge', 'בר'], division: 'Torah', chapters: 50, kjvFile: 'Genesis' },
  { id: 'exod', name: 'Exodus', hebrewName: 'שמות', abbreviations: ['ex', 'exo', 'exod', 'שמות'], division: 'Torah', chapters: 40, kjvFile: 'Exodus' },
  { id: 'lev', name: 'Leviticus', hebrewName: 'ויקרא', abbreviations: ['lev', 'lv', 'ויק'], division: 'Torah', chapters: 27, kjvFile: 'Leviticus' },
  { id: 'num', name: 'Numbers', hebrewName: 'במדבר', abbreviations: ['num', 'nm', 'במד'], division: 'Torah', chapters: 36, kjvFile: 'Numbers' },
  { id: 'deut', name: 'Deuteronomy', hebrewName: 'דברים', abbreviations: ['deut', 'dt', 'דב'], division: 'Torah', chapters: 34, kjvFile: 'Deuteronomy' },
  { id: 'josh', name: 'Joshua', hebrewName: 'יהושע', abbreviations: ['josh', 'js', 'יהו'], division: 'Nevi\'im', chapters: 24, kjvFile: 'Joshua' },
  { id: 'judg', name: 'Judges', hebrewName: 'שופטים', abbreviations: ['judg', 'jg', 'שופ'], division: 'Nevi\'im', chapters: 21, kjvFile: 'Judges' },
  { id: 'sam1', name: '1 Samuel', hebrewName: 'שמואל א', abbreviations: ['1sam', '1sa', '1s', 'שמ״א'], division: 'Nevi\'im', chapters: 31, kjvFile: '1Samuel' },
  { id: 'sam2', name: '2 Samuel', hebrewName: 'שמואל ב', abbreviations: ['2sam', '2sa', '2s', 'שמ״ב'], division: 'Nevi\'im', chapters: 24, kjvFile: '2Samuel' },
  { id: 'kgs1', name: '1 Kings', hebrewName: 'מלכים א', abbreviations: ['1kgs', '1k', 'מל״א'], division: 'Nevi\'im', chapters: 22, kjvFile: '1Kings' },
  { id: 'kgs2', name: '2 Kings', hebrewName: 'מלכים ב', abbreviations: ['2kgs', '2k', 'מל״ב'], division: 'Nevi\'im', chapters: 25, kjvFile: '2Kings' },
  { id: 'isa', name: 'Isaiah', hebrewName: 'ישעיהו', abbreviations: ['isa', 'is', 'ישע'], division: 'Nevi\'im', chapters: 66, kjvFile: 'Isaiah' },
  { id: 'jer', name: 'Jeremiah', hebrewName: 'ירמיהו', abbreviations: ['jer', 'jr', 'ירמ'], division: 'Nevi\'im', chapters: 52, kjvFile: 'Jeremiah' },
  { id: 'ezek', name: 'Ezekiel', hebrewName: 'יחזקאל', abbreviations: ['ezek', 'eze', 'יחז'], division: 'Nevi\'im', chapters: 48, kjvFile: 'Ezekiel' },
  { id: 'hos', name: 'Hosea', hebrewName: 'הושע', abbreviations: ['hos', 'ho', 'הוש'], division: 'Nevi\'im', chapters: 14, kjvFile: 'Hosea' },
  { id: 'joel', name: 'Joel', hebrewName: 'יואל', abbreviations: ['joel', 'jl', 'יואל'], division: 'Nevi\'im', chapters: 4, kjvFile: 'Joel' },
  { id: 'amos', name: 'Amos', hebrewName: 'עמוס', abbreviations: ['amos', 'am', 'עמוס'], division: 'Nevi\'im', chapters: 9, kjvFile: 'Amos' },
  { id: 'obad', name: 'Obadiah', hebrewName: 'עובדיה', abbreviations: ['obad', 'ob', 'עוב'], division: 'Nevi\'im', chapters: 1, kjvFile: 'Obadiah' },
  { id: 'jonah', name: 'Jonah', hebrewName: 'יונה', abbreviations: ['jonah', 'jon', 'יונה'], division: 'Nevi\'im', chapters: 4, kjvFile: 'Jonah' },
  { id: 'mic', name: 'Micah', hebrewName: 'מיכה', abbreviations: ['mic', 'mi', 'מיכה'], division: 'Nevi\'im', chapters: 7, kjvFile: 'Micah' },
  { id: 'nah', name: 'Nahum', hebrewName: 'נחום', abbreviations: ['nah', 'na', 'נחום'], division: 'Nevi\'im', chapters: 3, kjvFile: 'Nahum' },
  { id: 'hab', name: 'Habakkuk', hebrewName: 'חבקוק', abbreviations: ['hab', 'hb', 'חבק'], division: 'Nevi\'im', chapters: 3, kjvFile: 'Habakkuk' },
  { id: 'zeph', name: 'Zephaniah', hebrewName: 'צפניה', abbreviations: ['zeph', 'zep', 'צפ'], division: 'Nevi\'im', chapters: 3, kjvFile: 'Zephaniah' },
  { id: 'hag', name: 'Haggai', hebrewName: 'חגי', abbreviations: ['hag', 'hg', 'חגי'], division: 'Nevi\'im', chapters: 2, kjvFile: 'Haggai' },
  { id: 'zech', name: 'Zechariah', hebrewName: 'זכריה', abbreviations: ['zech', 'zec', 'זכר'], division: 'Nevi\'im', chapters: 14, kjvFile: 'Zechariah' },
  { id: 'mal', name: 'Malachi', hebrewName: 'מלאכי', abbreviations: ['mal', 'ml', 'מלא'], division: 'Nevi\'im', chapters: 3, kjvFile: 'Malachi' },
  { id: 'ps', name: 'Psalms', hebrewName: 'תהילים', abbreviations: ['ps', 'psa', 'pss', 'תה'], division: 'Ketuvim', chapters: 150, kjvFile: 'Psalms' },
  { id: 'prov', name: 'Proverbs', hebrewName: 'משלי', abbreviations: ['prov', 'pr', 'מש'], division: 'Ketuvim', chapters: 31, kjvFile: 'Proverbs' },
  { id: 'job', name: 'Job', hebrewName: 'איוב', abbreviations: ['job', 'jb', 'אי'], division: 'Ketuvim', chapters: 42, kjvFile: 'Job' },
  { id: 'song', name: 'Song of Songs', hebrewName: 'שיר השירים', abbreviations: ['song', 'sos', 'songs', 'cant', 'שהש'], division: 'Ketuvim', chapters: 8, kjvFile: 'SongofSolomon' },
  { id: 'ruth', name: 'Ruth', hebrewName: 'רות', abbreviations: ['ruth', 'ru', 'רות'], division: 'Ketuvim', chapters: 4, kjvFile: 'Ruth' },
  { id: 'lam', name: 'Lamentations', hebrewName: 'איכה', abbreviations: ['lam', 'la', 'איכה'], division: 'Ketuvim', chapters: 5, kjvFile: 'Lamentations' },
  { id: 'eccl', name: 'Ecclesiastes', hebrewName: 'קהלת', abbreviations: ['eccl', 'ecc', 'qoh', 'קה'], division: 'Ketuvim', chapters: 12, kjvFile: 'Ecclesiastes' },
  { id: 'esth', name: 'Esther', hebrewName: 'אסתר', abbreviations: ['esth', 'es', 'אס'], division: 'Ketuvim', chapters: 10, kjvFile: 'Esther' },
  { id: 'dan', name: 'Daniel', hebrewName: 'דניאל', abbreviations: ['dan', 'da', 'דנ'], division: 'Ketuvim', chapters: 12, kjvFile: 'Daniel' },
  { id: 'ezra', name: 'Ezra', hebrewName: 'עזרא', abbreviations: ['ezra', 'ezr', 'עז'], division: 'Ketuvim', chapters: 10, kjvFile: 'Ezra' },
  { id: 'neh', name: 'Nehemiah', hebrewName: 'נחמיה', abbreviations: ['neh', 'ne', 'נח'], division: 'Ketuvim', chapters: 13, kjvFile: 'Nehemiah' },
  { id: 'chr1', name: '1 Chronicles', hebrewName: 'דברי הימים א', abbreviations: ['1chr', '1ch', 'דה״א'], division: 'Ketuvim', chapters: 29, kjvFile: '1Chronicles' },
  { id: 'chr2', name: '2 Chronicles', hebrewName: 'דברי הימים ב', abbreviations: ['2chr', '2ch', 'דה״ב'], division: 'Ketuvim', chapters: 36, kjvFile: '2Chronicles' },
]

const booksById = new Map(books.map((book) => [book.id, book]))

export function getBookById(id: string): Book | undefined {
  return booksById.get(id)
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ')
}

/** Resolves a book by name, Hebrew name, or abbreviation. */
export function findBook(query: string): Book | undefined {
  const normalized = normalize(query)
  const compact = normalized.replace(/[\s-]/g, '')
  return books.find((book) => [book.name, book.hebrewName, ...book.abbreviations].some((value) => {
    const candidate = normalize(value)
    return candidate === normalized || candidate.replace(/[\s-]/g, '') === compact
  }))
}

export type ParsedReference = { book: Book; chapter: number; verse?: number }

/**
 * Parses a free-text reference such as `Gen 1:1`, `Genesis 1`, or `בראשית 1:1`.
 * Returns undefined when the book is unknown or the chapter is out of range.
 */
export function parseReference(value: string): ParsedReference | undefined {
  const match = value.trim().match(/^(.+?)\s+(\d+)(?::(\d+))?$/)
  const book = findBook(match?.[1] ?? value)
  if (!book) return undefined
  const chapter = match ? Number(match[2]) : 1
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return undefined
  const verse = match?.[3] ? Number(match[3]) : undefined
  if (verse !== undefined && (!Number.isInteger(verse) || verse < 1)) return undefined
  return { book, chapter, verse }
}

export type ValidatedRequest = { book: Book; chapter: number }

/**
 * Validates untrusted `book` and `chapter` query parameters. Returning a
 * discriminated union keeps the failure reason available to the caller so the
 * API can report the real problem instead of a blanket 404.
 */
export function validateBookChapter(
  bookId: string | null,
  chapterValue: string | null,
): { ok: true; value: ValidatedRequest } | { ok: false; error: string } {
  if (!bookId) return { ok: false, error: 'The "book" parameter is required.' }
  const book = getBookById(bookId)
  if (!book) return { ok: false, error: `Unknown book "${bookId}".` }
  if (!chapterValue) return { ok: false, error: 'The "chapter" parameter is required.' }
  const chapter = Number(chapterValue)
  if (!Number.isInteger(chapter)) return { ok: false, error: `Chapter "${chapterValue}" is not an integer.` }
  if (chapter < 1 || chapter > book.chapters) {
    return { ok: false, error: `Chapter ${chapter} is out of range for ${book.name} (1-${book.chapters}).` }
  }
  return { ok: true, value: { book, chapter } }
}
