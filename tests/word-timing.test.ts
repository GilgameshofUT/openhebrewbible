import { describe, expect, it } from 'vitest'
import { activeWordAt, type AlignedWord } from '@/lib/word-timing'

const words: AlignedWord[] = [
  { id: 'a', start: 0, end: 100 },
  { id: 'b', start: 100, end: 250 },
  { id: 'c', start: 250, end: 400 },
]

describe('activeWordAt', () => {
  it('returns undefined before the first word', () => {
    expect(activeWordAt(words, -5)).toBeUndefined()
    expect(activeWordAt(words, -1)).toBeUndefined()
  })

  it('picks the word whose window contains the position', () => {
    expect(activeWordAt(words, 0)).toBe('a')
    expect(activeWordAt(words, 99)).toBe('a')
    expect(activeWordAt(words, 100)).toBe('b')
    expect(activeWordAt(words, 249)).toBe('b')
    expect(activeWordAt(words, 250)).toBe('c')
  })

  it('returns undefined after the last word ends', () => {
    expect(activeWordAt(words, 400)).toBeUndefined()
    expect(activeWordAt(words, 9999)).toBeUndefined()
  })

  it('handles empty input', () => {
    expect(activeWordAt([], 0)).toBeUndefined()
  })
})
