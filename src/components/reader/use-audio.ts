'use client'

import { useEffect, useRef, useState } from 'react'
import { isMechonMamre, type AudioResource, type SoundCloudWidget } from './types'

const PREFERENCE_KEY = 'web-tanakh-audio-source'

declare global {
  interface Window {
    SC?: { Widget: (iframe: HTMLIFrameElement) => SoundCloudWidget }
  }
}

/**
 * Loads chapter audio and remembers which provider the reader prefers.
 *
 * The preference is stored as a provider name rather than a resource id,
 * because ids are chapter-specific.
 */
export function useAudio(bookId: string, chapter: number) {
  const [resources, setResources] = useState<AudioResource[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [open, setOpen] = useState(false)
  const frame = useRef<HTMLIFrameElement | null>(null)

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

  // Stop a finished SoundCloud track instead of letting the widget roll on.
  useEffect(() => {
    if (!open || !isSoundCloud) return
    let cancelled = false
    const setupWidget = () => {
      if (cancelled || !window.SC || !frame.current) return
      const widget = window.SC.Widget(frame.current)
      // Lowercase: the player dispatches "finish", not "FINISH".
      widget.bind('finish', () => widget.pause())
    }
    if (window.SC) {
      setupWidget()
      return () => { cancelled = true }
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
  }, [open, isSoundCloud, active?.id])

  function choose(resource: AudioResource) {
    setSelectedId(resource.id)
    window.localStorage.setItem(PREFERENCE_KEY, isMechonMamre(resource) ? 'mechon' : 'project-929')
    setOpen(true)
  }

  return { resources, active, open, setOpen, choose, frame }
}
