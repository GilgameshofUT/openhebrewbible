/** One word's karaoke window, in milliseconds. */
export type AlignedWord = { id: string; start: number; end: number }

/**
 * Returns the id of the word being spoken at `positionMs`, or undefined when
 * the position falls before the first word or after the last.
 *
 * `words` must be sorted by `start`. Binary search: the active word is the
 * last one whose window began at or before the position, provided the
 * position is still inside that window.
 */
export function activeWordAt(words: AlignedWord[], positionMs: number): string | undefined {
  if (words.length === 0 || positionMs < words[0].start) return undefined

  let low = 0
  let high = words.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (words[mid].start <= positionMs) low = mid
    else high = mid - 1
  }

  const word = words[low]
  return positionMs < word.end ? word.id : undefined
}
