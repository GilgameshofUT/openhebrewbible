'use client'

import { useEffect, useRef, useState } from 'react'
import { isMechonMamre, type AudioResource, type SoundCloudWidget } from './types'

const PREFERENCE_KEY = 'web-tanakh-audio-source'

declare global {
  interface Window {
    SC?: { Widget: (iframe: HTMLIFrameElement) => SoundCloudWidget }
  }
}

type AudioCommand = { kind: 'start' } | { kind: 'seek'; positionMs: number }

/**
 * Loads chapter audio, remembers which provider the reader prefers, and owns
 * the transport commands (play / seek) for whichever player is mounted.
 *
 * The preference is stored as a provider name rather than a resource id,
 * because ids are chapter-specific.
 */
export function useAudio(bookId: string, chapter: number) {
  const [resources, setResources] = useState<AudioResource[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [open, setOpen] = useState(false)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const nativeAudio = useRef<HTMLAudioElement | null>(null)
  // A state (not a ref) so issuing a new command while the player is already
  // open still re-renders and re-delivers it.
  const [command, setCommand] = useState<AudioCommand | null>(null)

  useEffect(() => {
    let active = true
    setOpen(false)
    fetch(`/api/audio?book=${encodeURIComponent(bookId)}&chapter=${chapter}`)
      .then((response) => response.json())
      .then((data: { resources?: AudioResource[] }) => {
        if (!active) return
        const loaded = data.resources ?? []
        const preference = window.localStorage.getItem(PREFERENCE_KEY)
        const preferred = loaded.find((resource) =>
          preference === 'mechon' ? isMechonMamre(resource) : !isMechonMamre(resource),
        )
        setResources(loaded)
        setSelectedId(preferred?.id ?? loaded[0]?.id ?? '')
      })
      .catch(() => {
        if (active) { setResources([]); setSelectedId('') }
      })
    return () => { active = false }
  }, [bookId, chapter])

  const active = resources.find((resource) => resource.id === selectedId) ?? resources[0]
  const isSoundCloud = Boolean(active && !isMechonMamre(active))

  // Bind a vanilla SoundCloud widget (no highlight logic — that lives in
  // use-karaoke) once per mount.
  const widgetRef = useRef<SoundCloudWidget | null>(null)
  useEffect(() => {
    if (!open || !isSoundCloud || !frame.current) return
    let cancelled = false
    const setupWidget = () => {
      if (cancelled || !window.SC || !frame.current) return
      const widget = window.SC.Widget(frame.current)
      widgetRef.current = widget
      // Lowercase: the player dispatches "finish", not "FINISH".
      widget.bind('finish', () => widget.pause())
    }
    if (window.SC) {
      setupWidget()
      return () => { cancelled = true; widgetRef.current = null }
    }
    // Append the provider script at most once per document.
    const existing = document.querySelector<HTMLScriptElement>('script[data-soundcloud-api]')
    const script = existing ?? document.createElement('script')
    if (!existing) {
      script.src = 'https://w.soundcloud.com/player/api.js'
      script.dataset.soundcloudApi = 'true'
    }
    script.addEventListener('load', setupWidget)
    if (!existing) document.head.appendChild(script)
    return () => { cancelled = true; script.removeEventListener('load', setupWidget) }
  }, [open, isSoundCloud, active?.id, frame])

  // Deliver a queued play/seek once the player exists. The SoundCloud widget
  // queues commands until it is ready, so transport can be issued immediately;
  // the native element needs currentTime set after metadata loads.
  useEffect(() => {
    if (!open || !active || !command) return
    const { kind, positionMs } = command as AudioCommand & { positionMs?: number }
    setCommand(null)

    if (isMechonMamre(active)) {
      const el = nativeAudio.current
      if (!el) return
      const start = () => {
        if (kind === 'seek' && positionMs != null) el.currentTime = positionMs / 1000
        void el.play()
      }
      // preload="none" means no metadata yet; seeking before it has loaded is a
      // no-op in some browsers, so wait for the first loadedmetadata event.
      if (el.readyState >= 1) start()
      else el.addEventListener('loadedmetadata', start, { once: true })
      return
    }

    if (window.SC && frame.current) {
      const widget = window.SC.Widget(frame.current)
      if (kind === 'seek' && positionMs != null) widget.seekTo(positionMs)
      widget.play()
    }
  }, [open, active, isSoundCloud, command])

  /** Open the panel and start playback from the beginning of the track. */
  function playFromStart() {
    setCommand({ kind: 'start' })
    setOpen(true)
  }

  /** Open the panel (if needed), seek to milliseconds in the track, and play. */
  function playFrom(positionMs: number) {
    setCommand({ kind: 'seek', positionMs })
    setOpen(true)
  }

  function choose(resource: AudioResource) {
    setSelectedId(resource.id)
    window.localStorage.setItem(PREFERENCE_KEY, isMechonMamre(resource) ? 'mechon' : 'project-929')
    setCommand({ kind: 'start' })
    setOpen(true)
  }

  return { resources, active, open, setOpen, choose, playFromStart, playFrom, frame, nativeAudio }
}