'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { activeWordAt, type AlignedWord } from '@/lib/word-timing'
import { isMechonMamre, type AudioResource, type SoundCloudWidget } from './types'

/**
 * Highlights the word being spoken while audio plays.
 *
 * Project 929 runs in a SoundCloud iframe: the widget reports position via
 * playProgress every ~250 ms, and a requestAnimationFrame loop extrapolates
 * forward between anchors. Mechon Mamre runs in a plain <audio> element whose
 * timeupdate fires ~4x/sec; there we read currentTime directly and skip the
 * extrapolation (the audio element is the source of truth).
 */
export function useKaraoke(
  frame: RefObject<HTMLIFrameElement | null>,
  nativeAudio: RefObject<HTMLAudioElement | null>,
  open: boolean,
  resource: AudioResource | undefined,
  bookId: string,
  chapter: number,
) {
  const isMechon = Boolean(resource && isMechonMamre(resource))
  const enabled = Boolean(resource)
  const activeId = resource?.id
  const [words, setWords] = useState<AlignedWord[]>([])
  const [activeWordId, setActiveWordId] = useState<string | undefined>(undefined)

  // Load this chapter's alignment data. Each provider has its own timing set
  // because they are different readers at different paces.
  useEffect(() => {
    let live = true
    setActiveWordId(undefined)
    setWords([])
    if (!enabled) return
    const source = isMechon ? 'mechon' : ''
    fetch(`/api/alignment?book=${encodeURIComponent(bookId)}&chapter=${chapter}&source=${source}`)
      .then((response) => response.json())
      .then((data: { words?: AlignedWord[] }) => {
        if (!live) return
        setWords(data.words ?? [])
      })
      .catch(() => { if (live) setWords([]) })
    return () => { live = false }
  }, [enabled, isMechon, bookId, chapter, activeId])

  const anchorRef = useRef({ position: 0, at: 0 })
  const playingRef = useRef(false)
  const pausedRef = useRef(true)
  const readyRef = useRef(false)
  const lastActiveRef = useRef<string | undefined>(undefined)
  const wordsRef = useRef<AlignedWord[]>([])
  wordsRef.current = words

  // Bind playback events whenever the player mounts or the track changes.
  useEffect(() => {
    if (!open || !enabled) return
    let cancelled = false
    let widget: SoundCloudWidget | null = null

    // Close-unmount teardown: the iframe never dispatches pause/finish when
    // the panel closes, and the native element just becomes hidden. Clear the
    // highlight ourselves. lastActive is reset too, or a resumed track landing
    // on the same word would never re-light it.
    const teardown = () => {
      cancelled = true
      readyRef.current = false
      playingRef.current = false
      pausedRef.current = true
      lastActiveRef.current = undefined
      setActiveWordId(undefined)
    }

    // --- Mechon Mamre: native <audio>, timeupdate is the source of truth ---
    if (isMechon) {
      const el = nativeAudio.current
      if (!el) return teardown
      const onTimeUpdate = () => {
        if (cancelled) return
        anchorRef.current = { position: el.currentTime * 1000, at: Date.now() }
        if (!pausedRef.current) playingRef.current = true
      }
      const onPlay = () => { if (!cancelled) { pausedRef.current = false; playingRef.current = true } }
      const onPause = () => { if (!cancelled) { pausedRef.current = true; playingRef.current = false; setActiveWordId(undefined) } }
      const onSeeked = onTimeUpdate
      const onEnded = onPause
      el.addEventListener('timeupdate', onTimeUpdate)
      el.addEventListener('play', onPlay)
      el.addEventListener('pause', onPause)
      el.addEventListener('seeked', onSeeked)
      el.addEventListener('ended', onEnded)
      return () => {
        el.removeEventListener('timeupdate', onTimeUpdate)
        el.removeEventListener('play', onPlay)
        el.removeEventListener('pause', onPause)
        el.removeEventListener('seeked', onSeeked)
        el.removeEventListener('ended', onEnded)
        teardown()
      }
    }

    // --- Project 929: SoundCloud widget ---
    if (!frame.current) return teardown

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
          const progress = arg as { currentPosition?: number } | undefined
          if (progress && typeof progress.currentPosition === 'number') {
            applyPosition(progress.currentPosition)
          } else {
            widget!.getPosition(applyPosition)
          }
          // After pause() the widget keeps reporting a settling playhead
          // (playProgress then SEEK). Those trailing events must not restart
          // the rAF loop, so playProgress only counts as evidence of live
          // playback when the widget is not known to be paused.
          if (!pausedRef.current) playingRef.current = true
        })
        widget!.bind('play', () => { if (!cancelled) { pausedRef.current = false; playingRef.current = true; widget!.getPosition(applyPosition) } })
        widget!.bind('pause', () => { if (!cancelled) { pausedRef.current = true; playingRef.current = false; setActiveWordId(undefined) } })
        widget!.bind('seek', () => { if (!cancelled) widget!.getPosition(applyPosition) })
        widget!.bind('finish', () => { if (!cancelled) { pausedRef.current = true; playingRef.current = false; setActiveWordId(undefined) } })
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
      return teardown
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
        teardown()
        script.removeEventListener('load', setup)
      }
    }
  }, [open, enabled, isMechon, activeId, frame, nativeAudio])
  // Extrapolate between playProgress anchors and move the highlight on
  // word changes only. Gated on `open` so the loop doesn't spin at 60 Hz
  // all session once alignment has loaded — it burned battery even with the
  // player closed.
  useEffect(() => {
    if (words.length === 0 || !open) return
    let raf = 0

    const tick = () => {
      if (playingRef.current) {
        const { position, at } = anchorRef.current
        const estimated = position + (Date.now() - at) / 1000 * 1000
        const active = activeWordAt(wordsRef.current, estimated)
        if (active !== lastActiveRef.current) {
          lastActiveRef.current = active
          setActiveWordId(active)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [words, open])

  return { activeWordId, words }
}
