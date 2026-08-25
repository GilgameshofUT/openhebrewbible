import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HebrewVerse } from '@/components/reader/hebrew-text'
import type { Verse, Word } from '@/data/tanakh'
import type { NoteResource } from '@/components/reader/types'

afterEach(() => { document.body.innerHTML = '' })

const word: Word = {
  id: 'w1',
  text: 'בְּרֵאשִׁית',
  lemma: 'רֵאשִׁית',
  morphology: 'N',
  morphologyLabel: 'noun',
  lexiconId: '7225',
}

const verse: Verse = {
  number: 1,
  hebrew: 'בְּרֵאשִׁית',
  english: 'In the beginning',
  words: [word],
}

function resource(id: string, kind: string): NoteResource {
  return { id, provider: 'test', title: `Title ${id}`, url: 'https://example.com', kind }
}

/** Wraps members the same way the notes API does: one group per verse. */
function group(...members: NoteResource[]): NoteResource[] {
  return [{
    id: `group:${members.map((member) => member.id).join('|')}`,
    provider: 'test',
    title: 'Notes',
    url: 'https://example.com',
    kind: 'group',
    resources: members,
  }]
}

describe('verse note kind indicators', () => {
  const onOpenNote = vi.fn()
  const onSelectWord = vi.fn()

  it('shows one emoji per distinct kind in text/article/video order', () => {
    render(
      <HebrewVerse
        verse={verse}
        selectedWordId={undefined}
        activeWordId={undefined}
        notes={group(resource('v', 'video'), resource('t', 'text'), resource('a', 'article'))}
        onOpenNote={onOpenNote}
        onSelectWord={onSelectWord}
      />,
    )
    const button = screen.getByRole('button', { name: /Notes/ })
    expect(button.textContent).toContain('📝🎓🎬')
  })

  it('dedupes multiple resources of the same kind', () => {
    render(
      <HebrewVerse
        verse={verse}
        selectedWordId={undefined}
        activeWordId={undefined}
        notes={group(resource('v1', 'video'), resource('v2', 'video'), resource('t', 'text'))}
        onOpenNote={onOpenNote}
        onSelectWord={onSelectWord}
      />,
    )
    const button = screen.getByRole('button', { name: /Notes/ })
    expect(button.textContent).toContain('📝🎬')
    expect(button.textContent).not.toContain('🎬🎬')
  })

  it('names the kinds in the accessible label and hides the emojis from it', () => {
    render(
      <HebrewVerse
        verse={verse}
        selectedWordId={undefined}
        activeWordId={undefined}
        notes={group(resource('v', 'video'))}
        onOpenNote={onOpenNote}
        onSelectWord={onSelectWord}
      />,
    )
    const button = screen.getByRole('button', { name: 'Notes: video' })
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('derives the kind from a single ungrouped resource', () => {
    render(
      <HebrewVerse
        verse={verse}
        selectedWordId={undefined}
        activeWordId={undefined}
        notes={[resource('a', 'article')]}
        onOpenNote={onOpenNote}
        onSelectWord={onSelectWord}
      />,
    )
    const button = screen.getByRole('button', { name: 'Notes: article' })
    expect(button.textContent).toContain('🎓')
  })

  it('shows the visible Notes word alongside the icons', () => {
    render(
      <HebrewVerse
        verse={verse}
        selectedWordId={undefined}
        activeWordId={undefined}
        notes={group(resource('v', 'video'))}
        onOpenNote={onOpenNote}
        onSelectWord={onSelectWord}
      />,
    )
    const button = screen.getByRole('button', { name: 'Notes: video' })
    expect(button.textContent).toContain('Notes')
    expect(button.textContent).toContain('🎬')
  })
})