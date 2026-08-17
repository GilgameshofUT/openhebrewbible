'use client'

import { useEffect, useState, type RefObject } from 'react'
import { isMechonMamre, type AudioResource, type NoteResource } from './types'

const SPEED_OPTIONS = [0.5, 0.75, 1]

export function ChapterResources({
  chapterNotes,
  renderNoteButton,
  audio,
}: {
  chapterNotes: NoteResource[]
  renderNoteButton: (note: NoteResource) => React.ReactNode
  audio: {
    resources: AudioResource[]
    active: AudioResource | undefined
    open: boolean
    setOpen: (open: boolean) => void
    choose: (resource: AudioResource) => void
    playFromStart: () => void
    frame: RefObject<HTMLIFrameElement | null>
    nativeAudio: RefObject<HTMLAudioElement | null>
  }
}) {
  const [rate, setRate] = useState(1)
  const mechon = Boolean(audio.active && isMechonMamre(audio.active))

  // Apply the chosen speed to the native element whenever it (re)mounts.
  useEffect(() => {
    const el = audio.nativeAudio.current
    if (el) el.playbackRate = rate
  }, [audio.nativeAudio, audio.open, rate])

  if (!chapterNotes.length && !audio.resources.length) return null

  return (
    <div className="chapter-resources">
      <div className="chapter-resource-links">{chapterNotes.map(renderNoteButton)}</div>
      {audio.resources.length > 0 && (
        <section className="chapter-audio">
          <div className="chapter-audio-controls">
            {audio.resources.length > 1 && (
              <div className="audio-source-options" role="group" aria-label="Audio source">
                {audio.resources.map((resource) => (
                  <button
                    type="button"
                    key={resource.id}
                    className={audio.active?.id === resource.id ? 'audio-source-option selected' : 'audio-source-option'}
                    aria-pressed={audio.active?.id === resource.id}
                    onClick={() => audio.choose(resource)}
                  >
                    {isMechonMamre(resource) ? 'Mechon Mamre' : 'Project 929'}
                  </button>
                ))}
              </div>
            )}
            {mechon && (
              <div className="audio-speed-options" role="group" aria-label="Playback speed">
                {SPEED_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={rate === option ? 'audio-speed-option selected' : 'audio-speed-option'}
                    aria-pressed={rate === option}
                    onClick={() => setRate(option)}
                  >
                    {option}×
                  </button>
                ))}
              </div>
            )}
            <button
              className="chapter-audio-toggle"
              type="button"
              onClick={() => (audio.open ? audio.setOpen(false) : audio.playFromStart())}
              aria-expanded={audio.open}
              aria-label={audio.open ? 'Close audio player' : 'Play audio'}
              title={audio.open ? 'Close audio player' : 'Play audio'}
            >
              {audio.open ? '×' : '▶'}
            </button>
          </div>
          {audio.open && audio.active && (
            <div className="audio-resource">
              <span>{audio.active.title}</span>
              {isMechonMamre(audio.active)
                ? <audio ref={audio.nativeAudio} controls preload="none" src={audio.active.url} />
                : audio.active.embedUrl
                  ? (
                      <iframe
                        ref={audio.frame}
                        title={audio.active.title}
                        src={`${audio.active.embedUrl}&hide_related=true&single_active=true`}
                        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                      />
                    )
                  : null}
            </div>
          )}
        </section>
      )}
    </div>
  )
}