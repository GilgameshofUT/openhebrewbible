'use client'

import { useCallback, useEffect, useState } from 'react'
import type { NoteResource } from './types'

/**
 * Loads external study resources for the current chapter, plus lemma-scoped
 * resources on demand when a word is selected.
 */
export function useNotes(bookId: string, chapter: number) {
  const [chapterNotes, setChapterNotes] = useState<NoteResource[]>([])
  const [verseNotes, setVerseNotes] = useState<Record<string, NoteResource[]>>({})
  const [lemmaNotes, setLemmaNotes] = useState<NoteResource[]>([])

  useEffect(() => {
    let active = true
    fetch(`/api/notes?book=${encodeURIComponent(bookId)}&chapter=${chapter}`)
      .then((response) => response.json())
      .then((data: { chapterNotes?: NoteResource[]; verseNotes?: Record<string, NoteResource[]> }) => {
        if (!active) return
        setChapterNotes(data.chapterNotes ?? [])
        setVerseNotes(data.verseNotes ?? {})
        setLemmaNotes([])
      })
      .catch(() => {
        if (!active) return
        setChapterNotes([])
        setVerseNotes({})
        setLemmaNotes([])
      })
    return () => { active = false }
  }, [bookId, chapter])

  const loadLemmaNotes = useCallback(async (lexiconId: string) => {
    if (!lexiconId) { setLemmaNotes([]); return }
    try {
      const response = await fetch(
        `/api/notes?book=${encodeURIComponent(bookId)}&chapter=${chapter}&lemma=${encodeURIComponent(lexiconId)}`,
      )
      const data = await response.json() as { notes?: NoteResource[] }
      setLemmaNotes(data.notes ?? [])
    } catch {
      setLemmaNotes([])
    }
  }, [bookId, chapter])

  return { chapterNotes, verseNotes, lemmaNotes, loadLemmaNotes }
}
