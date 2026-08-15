'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { activeWordAt, type AlignedWord } from '@/lib/word-timing'
import { isMechonMamre, type AudioResource, type SoundCloudWidget } from './types'

/**
 * Highlights the word being spoken while a Project 929 track plays.
 *
 * The SoundCloud widget reports position via playProgress every ~250 ms;
 * between those anchors a requestAnimationFrame loop extrapolates forward, so
 * the highlight stays glued to the audio instead of stepping. state only
 * changes when the active word actually changes.
 */
export function useKaraoke(
  frame: RefObject<HTMLIFrameElement | null>,
  open: boolean,
  resource: AudioResource | undefined,
  bookId: string,
  chapter: number,
) {
  const enabled = Boolean(resource && !isMechonMamre(resource))
  const activeId = resource?.id
  const [words, setWords] = useState<AlignedWord[]>([])
  const [activeWordId, setActiveWordId] = useState<string | undefined>(undefined)

  // Load this chapter's alignment data. Only SoundCloud (Project 929) has
  // timestamps; Mechon Mamre's reading pace differs, so no highlight there.
  useEffect(() => {
    let live = true
    setActiveWordId(undefined)
    if (!enabled) {
      setWords([])
      return
    }
    fetch(`/api/alignment?book=${encodeURIComponent(bookId)}&chapter=${chapter}`)
      .then((response) => response.json())
      .then((data: { words?: AlignedWord[] }) => {
        if (!live) return
        setWords(data.words ?? [])
      })
      .catch(() => { if (live) setWords([]) })
    return () => { live = false }
  }, [enabled, bookId, chapter, activeId])

  const anchorRef = useRef({ position: 0, at: 0 })
  const playingRef = useRef(false)
  const readyRef = useRef(false)
  const wordsRef = useRef<AlignedWord[]>([])
  wordsRef.current = words

  // Bind the widget events whenever the player mounts or the track changes.
  useEffect(() => {
    if (!open || !enabled || !frame.current) return
    let cancelled = false
    let widget: SoundCloudWidget | null = null

    const applyPosition = (position: number) => {
      anchorRef.current = { position, at: Date.now() }
    }

    // SC api.js may not be loaded yet (use-audio loads it independently and
    // this effect can run before that). Attach once the global exists.
    const setup = () => {
      if (cancelled || !frame.current || !window.SC) return
      widget = window.SC.Widget(frame.current)

      const onReady = () => {
        if (cancelled || readyRef.current) return
        readyRef.current = true
        widget!.bind('playProgress', (arg) => {
          if (cancelled) return
          // playProgress only fires while playing, so it is the most reliable
          // signal that playback is live (a seek-to-start can skip play).
          playingRef.current = true
          const progress = arg as { currentPosition?: number } | undefined
          if (progress && typeof progress.currentPosition === 'number') {
            applyPosition(progress.currentPosition)
          } else {
            widget!.getPosition(applyPosition)
          }
        })
        widget!.bind('play', () => { if (!cancelled) { playingRef.current = true; widget!.getPosition(applyPosition) } })
        widget!.bind('pause', () => { if (!cancelled) { playingRef.current = false; setActiveWordId(undefined) } })
        widget!.bind('seek', () => { if (!cancelled) widget!.getPosition(applyPosition) })
        widget!.bind('finish', () => { if (!cancelled) { playingRef.current = false; setActiveWordId(undefined) } })
        widget!.getPosition(applyPosition)
      }

      // The player dispatches callbacks by the exact lowercase method name it
      // posts ("play", "playProgress", ...). Binding "PLAY" or "SC_PLAY" never
      // fires, which is why the highlight did not move even while audio played.
      widget.bind('ready', onReady)
      // If READY already fired before we bound (api.js loaded late), commands
      // are still queued by the widget, so a probe detects readiness.
      widget.getPosition(() => {
        if (!cancelled && !readyRef.current) onReady()
      })
    }

    if (window.SC) {
      setup()
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-soundcloud-api]')
      const script = existing ?? document.createElement('script')
      if (!existing) {
        script.src = 'https://w.soundcloud.com/player/api.js'
        script.dataset.soundcloudApi = 'true'
      }
      script.addEventListener('load', setup)
      if (!existing) document.head.appendChild(script)
      return () => {
        cancelled = true
        script.removeEventListener('load', setup)
      }
    }

    return () => {
      cancelled = true
      readyRef.current = false
      playingRef.current = false
    }
  }, [open, enabled, activeId, frame])

  // Extrapolate between playProgress anchors and move the highlight on
  // word changes only.
  useEffect(() => {
    if (words.length === 0) return
    let raf = 0
    let lastActive: string | undefined

    const tick = () => {
      if (playingRef.current) {
        const { position, at } = anchorRef.current
        const estimated = position + (Date.now() - at) / 1000 * 1000
        const active = activeWordAt(wordsRef.current, estimated)
        if (active !== lastActive) {
          lastActive = active
          setActiveWordId(active)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [words])

  return { activeWordId }
}
