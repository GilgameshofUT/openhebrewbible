'use client'

import { useEffect, useState } from 'react'
import { books, type Book } from '@/data/tanakh'
import type { PendingReference } from './types'

const STORAGE_KEY = 'web-tanakh-reading-position'

type StoredPosition = { bookId?: string; chapter?: number; verse?: number }

/**
 * Restores the last reading position on mount and keeps it current as the
 * reader scrolls, so returning to the app resumes where the reader left off.
 */
export function useReadingPosition(
  book: Book,
  chapter: number,
  setBook: (book: Book) => void,
  setChapter: (chapter: number) => void,
  setPendingReference: (reference: PendingReference) => void,
) {
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    setRestored(true)
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      const position = JSON.parse(saved) as StoredPosition
      const savedBook = books.find((item) => item.id === position.bookId)
      if (!savedBook || !position.chapter) return
      if (position.chapter < 1 || position.chapter > savedBook.chapters) return
      setBook(savedBook)
      setChapter(position.chapter)
      if (position.verse) {
        setPendingReference({ bookId: savedBook.id, chapter: position.chapter, verse: position.verse })
      }
    } catch {
      // A malformed entry should never block the reader from starting.
    }
    // Restoration must run exactly once, before any navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist book and chapter, but not until restoration has run, or the
  // initial default would overwrite the stored position.
  useEffect(() => {
    if (!restored) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookId: book.id, chapter }))
  }, [restored, book.id, chapter])

  // Track the topmost visible verse so the position survives a reload
  // mid-chapter.
  useEffect(() => {
    if (!restored) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const verses = [...document.querySelectorAll<HTMLElement>('[id^="verse-"]')]
        const current = verses.find((verse) => verse.getBoundingClientRect().bottom >= 120) ?? verses.at(-1)
        const verse = current?.id.split('-').at(-1)
        if (verse) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookId: book.id, chapter, verse: Number(verse) }))
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [restored, book.id, chapter])
}
