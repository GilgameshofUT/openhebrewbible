/**
 * Regression tests for Hebrew display details that have repeatedly broken.
 *
 * The qere tooltip and the sof pasuq spacing were each reintroduced and lost
 * several times because nothing asserted them. These tests pin the contract:
 * the tooltip must be driven by a data attribute that is independent of
 * aria-label, and the stylesheet must keep the rules that render both.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withSofPasuq, plainTranslation, normalizeTranslation } from '@/lib/text'

const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')
// The word rendering and the note buttons now live in dedicated modules.
const hebrewText = readFileSync(join(process.cwd(), 'src', 'components', 'reader', 'hebrew-text.tsx'), 'utf8')
const readerIndex = readFileSync(join(process.cwd(), 'src', 'components', 'reader', 'index.tsx'), 'utf8')
const reader = `${hebrewText}\n${readerIndex}`

describe('qere tooltip', () => {
  it('keeps the ::after rule that renders the tooltip', () => {
    expect(css).toContain('.word.has-qere::after')
  })

  it('drives the tooltip from data-qere, not aria-label', () => {
    // aria-label is rewritten whenever the accessible name changes; coupling
    // the tooltip to it is what caused the repeated regressions.
    expect(css).toContain('content: attr(data-qere)')
    expect(css).not.toContain('content: attr(aria-label)')
  })

  it('reveals the tooltip on hover and keyboard focus', () => {
    expect(css).toMatch(/\.word\.has-qere:hover::after/)
    expect(css).toMatch(/\.word\.has-qere:focus-visible::after/)
  })

  it('emits data-qere at every word render site', () => {
    const renderSites = reader.match(/className=\{wordClass\(/g) ?? []
    const qereAttributes = reader.match(/data-qere=\{word\.qere\}/g) ?? []
    expect(renderSites.length).toBeGreaterThan(0)
    expect(qereAttributes).toHaveLength(renderSites.length)
  })

  it('marks ketiv words with the has-qere class', () => {
    expect(reader).toContain("word.qere ? ' has-qere' : ''")
  })
})

describe('karaoke highlight', () => {
  it('styles the active word class', () => {
    expect(css).toMatch(/\.word\.active-word\s*\{/)
  })

  it('emits the active-word class from wordClass', () => {
    expect(reader).toContain("active ? ' active-word' : ''")
  })
})

describe('karaoke widget events', () => {
  const karaokeSource = readFileSync(join(process.cwd(), 'src', 'components', 'reader', 'use-karaoke.ts'), 'utf8')

  it('binds the event names the player actually dispatches', () => {
    // The player posts lowercase method names ("play", "playProgress",
    // "ready", ...) and api.js dispatches callbacks by that exact string.
    // SC_PLAY never fired; "PLAY" (uppercase) is also wrong — the dispatcher
    // looks up callbacks["play"], not callbacks["PLAY"]. This was the reason
    // the highlight never moved even after the event-name fix landed.
    expect(karaokeSource).toMatch(/\.bind\('ready'/)
    expect(karaokeSource).toMatch(/\.bind\('play'/)
    expect(karaokeSource).toMatch(/\.bind\('pause'/)
    expect(karaokeSource).toMatch(/\.bind\('seek'/)
    expect(karaokeSource).toMatch(/\.bind\('finish'/)
    expect(karaokeSource).toMatch(/\.bind\('playProgress'/)
  })

  it('never binds the invented SC_* or mis-cased event names', () => {
    // Match the bind calls themselves, not source comments: the fix
    // deliberately documents why "SC_PLAY"/"PLAY" are wrong.
    expect(karaokeSource).not.toMatch(/\.bind\('SC_PLAY'/)
    expect(karaokeSource).not.toMatch(/\.bind\('SC_PAUSE'/)
    expect(karaokeSource).not.toMatch(/\.bind\('SC_SEEK'/)
    expect(karaokeSource).not.toMatch(/\.bind\('PLAY'/)
    expect(karaokeSource).not.toMatch(/\.bind\('PAUSE'/)
    expect(karaokeSource).not.toMatch(/\.bind\('SEEK'/)
    expect(karaokeSource).not.toMatch(/\.bind\('READY'/)
    expect(karaokeSource).not.toMatch(/\.bind\('PLAY_PROGRESS'/)
  })
})

describe('sof pasuq', () => {
  it('pulls the mark flush against the preceding word', () => {
    const rule = css.match(/\.verse-end-mark\s*\{[^}]*\}/)?.[0]
    expect(rule).toBeDefined()
    expect(rule).toMatch(/margin-inline-start:\s*calc\(/)
  })

  it('appends exactly one sof pasuq', () => {
    expect(withSofPasuq('בְּרֵאשִׁית')).toBe('בְּרֵאשִׁית׃')
    expect(withSofPasuq('בְּרֵאשִׁית׃')).toBe('בְּרֵאשִׁית׃')
    expect(withSofPasuq('בְּרֵאשִׁית׃׃')).toBe('בְּרֵאשִׁית׃')
  })

  it('collapses a maqaf or paseq that precedes the mark', () => {
    expect(withSofPasuq('אוֹר־׃')).toBe('אוֹר׃')
    expect(withSofPasuq('אוֹר׀׃')).toBe('אוֹר׃')
  })
})

describe('chapter resource styling', () => {
  it('defines .chapter-resources exactly once', () => {
    // Three duplicate copies of this block previously fought each other and
    // the last one dropped the container padding.
    const matches = css.match(/^\.chapter-resources \{/gm) ?? []
    expect(matches).toHaveLength(1)
  })

  it('aligns the resource row with the reading column', () => {
    const rule = css.match(/^\.chapter-resources \{[^}]*\}/m)?.[0]
    expect(rule).toContain('max-width')
    expect(rule).toContain('5vw')
  })

  it('styles every button class the reader actually emits', () => {
    const emitted = [...reader.matchAll(/'note-link (manuscript-link|resource-link)'/g)].map((match) => match[1])
    expect(emitted.length).toBeGreaterThan(0)
    for (const className of new Set(emitted)) {
      expect(css).toContain(`.chapter-resource-links .${className}`)
    }
  })
})

describe('translation markup', () => {
  it('converts divine-name spans to sentinels', () => {
    const result = normalizeTranslation('the <span class="divineName">Lord</span> spoke')
    expect(result).toBe('the {{DIVINE_NAME}}Lord{{/DIVINE_NAME}} spoke')
  })

  it('strips bidi control characters', () => {
    expect(normalizeTranslation('a\u200eb\u202ac')).toBe('abc')
  })

  it('flattens markup for plain-text contexts', () => {
    expect(plainTranslation('the <span class="divineName">Lord</span><p>spoke')).toBe('the Lord spoke')
  })

  it('treats both <p1> and <po1> poetry markers as line breaks', () => {
    expect(normalizeTranslation('a<p1>b')).toBe('a\nb')
    expect(normalizeTranslation('a<po1>b')).toBe('a\nb')
  })
})
