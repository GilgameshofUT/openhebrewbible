/**
 * Shared text normalisation for translation strings and Hebrew verse text.
 *
 * The JPS source markup carries inline HTML (`<p>`, `<span divineName>`) and
 * bidi control characters. Both the API and the reader need to interpret it,
 * so the rules live here rather than being reimplemented on each side where
 * they previously drifted apart.
 */

/** Bidi control characters that must not survive into rendered output. */
const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

export const DIVINE_NAME_OPEN = '{{DIVINE_NAME}}'
export const DIVINE_NAME_CLOSE = '{{/DIVINE_NAME}}'

/**
 * Replaces divine-name markup with neutral sentinels and converts paragraph
 * markers to newlines, leaving the caller to decide how to render them.
 */
export function normalizeTranslation(text: string) {
  return text
    .replace(/<span[^>]*divineName[^>]*>(.*?)<\/span>/gi, (_, name: string) => `${DIVINE_NAME_OPEN}${name}${DIVINE_NAME_CLOSE}`)
    .replace(/<p\s*>/gi, '\n\n')
    // OSHB uses both <p1> and <po1> style poetry markers for line breaks.
    .replace(/<po?\d+\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(BIDI_CONTROLS, '')
}

/** Flattens translation markup to a single plain-text line. */
export function plainTranslation(text: string) {
  return normalizeTranslation(text)
    .replaceAll(DIVINE_NAME_OPEN, '')
    .replaceAll(DIVINE_NAME_CLOSE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ensures verse text ends with exactly one sof pasuq, collapsing any maqaf or
 * paseq that precedes it. Used when composing occurrence snippets.
 */
export function withSofPasuq(hebrew: string) {
  return `${hebrew.replace(/[־׀]+׃$/, '׃').replace(/׃+$/, '')}׃`
}
