/**
 * Translation registry shared by the API routes and the reader UI.
 *
 * `versification` records which numbering system the edition natively uses.
 * Christian-system editions (KJV, WEB, YLT, BSB) are converted to Jewish
 * versification at import time (scripts/import-translations.ts) and stored
 * under data/sources/<id>/; at runtime every non-embedded translation is
 * looked up directly by the corpus's own chapter/verse numbers. The field
 * survives here so the reader can display the edition's original reference
 * for verses where the two systems diverge (e.g. "Ps 22:1" next to the
 * Jewish Ps 22:2).
 */
export type TranslationId = 'jps' | 'kjv' | 'web' | 'ylt' | 'bsb' | 'sct'

export type Translation = {
  id: TranslationId
  label: string
  shortLabel: string
  versification: 'jewish' | 'christian'
  /** True for the JPS text embedded in the corpus itself. */
  embedded?: boolean
}

export const TRANSLATIONS: Translation[] = [
  { id: 'jps', label: 'JPS 1917', shortLabel: 'JPS', versification: 'jewish', embedded: true },
  { id: 'kjv', label: 'King James Version', shortLabel: 'KJV', versification: 'christian' },
  { id: 'web', label: 'World English Bible', shortLabel: 'WEB', versification: 'christian' },
  { id: 'ylt', label: "Young's Literal Translation", shortLabel: 'YLT', versification: 'christian' },
  { id: 'bsb', label: 'Berean Standard Bible', shortLabel: 'BSB', versification: 'christian' },
  { id: 'sct', label: 'Sefaria Community Translation', shortLabel: 'SCT', versification: 'jewish' },
]

export const translationsById = new Map<string, Translation>(TRANSLATIONS.map((translation) => [translation.id, translation]))

export function isTranslationId(value: string): value is TranslationId {
  return translationsById.has(value)
}

export function translationLabel(id: TranslationId): string {
  return translationsById.get(id)?.label ?? id
}

export function translationShortLabel(id: TranslationId): string {
  return translationsById.get(id)?.shortLabel ?? id
}

export type TranslationJoinResult = { english: string; englishReference?: string }

/**
 * Joins one corpus verse to a stored translation. Translation files are keyed
 * by the corpus's own chapter/verse numbers (converted at import time), so
 * the lookup is direct. For Christian-system editions the edition's original
 * reference is attached when it differs from the Jewish one, e.g. Jewish
 * Ps 22:2 shows "Ps 22:1".
 */
export function joinTranslation(
  verseNumber: number,
  chapter: number,
  translation: Translation,
  text: Map<string, string>,
  citation?: { book: string; chapter: number; verse: number },
): TranslationJoinResult {
  const english = text.get(`${chapter}:${verseNumber}`) ?? ''
  if (translation.versification === 'christian' && citation) {
    return { english, englishReference: `${citation.book} ${citation.chapter}:${citation.verse}` }
  }
  return { english }
}
