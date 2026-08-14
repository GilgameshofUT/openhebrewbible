/**
 * Data-shape regression tests for the generated corpus and lexicon.
 *
 * These guard two defects that were invisible in code review because the
 * symptom only appeared in generated data:
 *
 * 1. JPS poetic line markers (<po1>, <po2>, ...) were dropped at import,
 *    running lines together with no separating space.
 * 2. BDB sense hierarchy was flattened, and the entry definition duplicated
 *    the sense list rendered beneath it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const generated = join(process.cwd(), 'data', 'generated')
const isaPath = join(generated, 'books', 'isa.json')
const lexiconPath = join(generated, 'oshb-lexicon.json')

// The derived artifacts are gitignored, so skip when they are absent.
const derived = existsSync(isaPath) && existsSync(lexiconPath)
const maybe = derived ? describe : describe.skip

type Sense = { number?: string; stem?: string; text: string; references: string[]; senses?: Sense[] }
type Entry = { gloss: string; definition: string; strongs?: string; bdbId?: string; senses?: Sense[] }

maybe('JPS poetic line breaks', () => {
  const isaiah = JSON.parse(readFileSync(isaPath, 'utf8')) as Record<string, Array<{ number: number; english?: string }>>

  it('keeps each poetic line of Isaiah 10:15 on its own line', () => {
    const verse = isaiah['10'].find((item) => item.number === 15)
    expect(verse?.english?.split('\n')).toHaveLength(4)
  })

  it('never runs a sentence directly into the next capitalised word', () => {
    // "...therewith?Should the saw..." was the visible symptom.
    const offenders: string[] = []
    for (const [chapter, verses] of Object.entries(isaiah)) {
      for (const verse of verses) {
        if (/[a-z][.?;,!][A-Z]/.test(verse.english ?? '')) offenders.push(`${chapter}:${verse.number}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

maybe('BDB lexicon structure', () => {
  const lexicon = JSON.parse(readFileSync(lexiconPath, 'utf8')) as Record<string, Entry>
  const entries = [...new Set(Object.values(lexicon))]

  it('preserves the stem hierarchy for a verb entry', () => {
    const natah = entries.find((entry) => entry.strongs === 'H5186')
    expect(natah).toBeDefined()
    expect(natah?.senses?.map((sense) => sense.stem)).toEqual(['Qal', 'Niph', 'Hiph'])
  })

  it('nests numbered and lettered sub-senses under their stem', () => {
    const natah = entries.find((entry) => entry.strongs === 'H5186')
    const qal = natah?.senses?.find((sense) => sense.stem === 'Qal')
    expect(qal?.senses?.map((sense) => sense.number)).toEqual(['1', '2', '3'])
    expect(qal?.senses?.[0].senses?.map((sense) => sense.number)).toEqual(['a', 'b', 'c'])
  })

  it('does not fold sense text into the entry definition', () => {
    const natah = entries.find((entry) => entry.strongs === 'H5186')
    expect(natah?.definition).toBe('stretch out; spread out; extend; incline; bend')
    expect(natah?.definition).not.toContain('Sense')
  })

  it('never labels a sense with the literal string "Sense N:"', () => {
    const flatten = (senses: Sense[]): Sense[] => senses.flatMap((s) => [s, ...flatten(s.senses ?? [])])
    const offenders = entries
      .flatMap((entry) => flatten(entry.senses ?? []))
      .filter((sense) => /^Sense \d/.test(sense.text))
    expect(offenders).toEqual([])
  })

  it('never leaks a "Sense N" label into an entry definition', () => {
    // Entries with no top-level <def> previously kept the stale flattened
    // string; they are now summarised from their sense glosses instead.
    const offenders = entries.filter((entry) => /Sense \d/.test(entry.definition))
    expect(offenders).toEqual([])
  })

  it('gives every entry a non-empty definition', () => {
    expect(entries.filter((entry) => !entry.definition)).toEqual([])
  })

  it('builds the definition from the entry\'s own <def> tags, not its sense tree', () => {
    // Authoritative check against the BDB source: for entries that declare
    // their own top-level <def>, the definition must be exactly those values.
    // This is what the flattening bug violated by appending every sense.
    const bdb = readFileSync(join(process.cwd(), 'data', 'sources', 'lexicon-BrownDriverBriggs.xml'), 'utf8')
    const sampled = entries.filter((entry) => (entry.senses ?? []).some((sense) => sense.stem)).slice(0, 200)
    const offenders: string[] = []

    for (const entry of sampled) {
      const match = bdb.match(new RegExp(`<entry id="${entry.bdbId?.replace(/\./g, '\\.')}"[\\s\\S]*?</entry>`))
      if (!match) continue
      // Only <def> elements before the first <sense> belong to the entry.
      const head = match[0].split('<sense')[0]
      const own = [...head.matchAll(/<def>(.*?)<\/def>/g)].map((m) => m[1])
      if (!own.length) continue
      const expected = own.join('; ').replace(/\s+/g, ' ').trim()
      if (entry.definition !== expected) offenders.push(`${entry.bdbId}: ${entry.definition} != ${expected}`)
    }

    expect(offenders).toEqual([])
  })
})
