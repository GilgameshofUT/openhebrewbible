/**
 * Re-parses BDB sense structure into the existing lexicon, using the cached
 * source in data/sources, without re-running the network import.
 *
 * Two defects are corrected:
 *
 * 1. `definition` was built by concatenating the entry's own <def> values
 *    with every nested sense, so it duplicated the sense list rendered
 *    directly beneath it in the study panel.
 *
 * 2. BDB senses are hierarchical: verb entries group senses by verbal stem
 *    (Qal, Niph., Hiph.) with numbered and lettered sub-senses. Flattening
 *    that tree dropped the stem labels and produced strings such as
 *    "Sense 2: Spread out pitch; Sense 3: Bend turn incline".
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'

const root = process.cwd()
const generated = join(root, 'data', 'generated')
const sourceDir = join(root, 'data', 'sources')

type Sense = { number?: string; stem?: string; text: string; references: string[]; senses?: Sense[] }

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['entry', 'def', 'sense', 'ref'].includes(name),
})

function list(value: any): any[] { return value == null ? [] : Array.isArray(value) ? value : [value] }

function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join('')
  return typeof value === 'string' ? value : value?.['#text'] ?? ''
}

function inlineText(value: any): string {
  if (Array.isArray(value)) return value.map(inlineText).join('')
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  return Object.entries(value)
    .filter(([key]) => !key.startsWith('@_') && key !== 'sense' && key !== 'ref')
    .map(([, child]) => inlineText(child))
    .join('')
}

/** The entry's own headline definitions, excluding nested senses. */
function definitionText(entry: any): string {
  return list(entry.def).map(text).join('; ').replace(/\s+/g, ' ').trim()
}

/**
 * Some entries carry no top-level <def> and define themselves entirely
 * through their senses. Summarise those from the sense glosses rather than
 * leaving the definition empty, but never with a "Sense N:" prefix.
 */
function summariseFromSenses(senses: Sense[]): string {
  const parts = senses.flatMap((sense) => [sense.text, ...(sense.senses ?? []).map((child) => child.text)])
  return [...new Set(parts.filter(Boolean))].join('; ')
}

function senseRecords(entry: any): Sense[] {
  return list(entry.sense).map((sense: any) => {
    const stem = text(sense.stem).replace(/\s+/g, ' ').replace(/\.$/, '').trim()
    const children = senseRecords(sense)
    return {
      ...(sense['@_n'] ? { number: String(sense['@_n']) } : {}),
      ...(stem ? { stem } : {}),
      text: definitionText(sense),
      references: list(sense.ref).map((ref: any) => ref['@_r'] ?? inlineText(ref)).filter(Boolean),
      ...(children.length ? { senses: children } : {}),
    } as Sense
  }).filter((sense) => sense.text || sense.stem || sense.senses?.length)
}

function collectEntries(node: any, into: Map<string, any>) {
  if (Array.isArray(node)) { for (const item of node) collectEntries(item, into); return }
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (key === 'entry') {
      for (const entry of list(value)) {
        if (entry?.['@_id']) into.set(entry['@_id'], entry)
        collectEntries(entry, into)
      }
      continue
    }
    collectEntries(value, into)
  }
}

async function main() {
  const bdbXml = await readFile(join(sourceDir, 'lexicon-BrownDriverBriggs.xml'), 'utf8')
  const parsed = parser.parse(bdbXml)
  const entries = new Map<string, any>()
  collectEntries(parsed, entries)
  console.log(`Parsed ${entries.size} BDB entries.`)

  const lexicon = JSON.parse(await readFile(join(generated, 'oshb-lexicon.json'), 'utf8')) as Record<string, any>

  let updated = 0
  let structured = 0
  const seen = new Set<any>()

  for (const entry of Object.values(lexicon)) {
    // Multiple lemma keys can share one entry object.
    if (seen.has(entry)) continue
    seen.add(entry)
    const bdb = entry.bdbId ? entries.get(entry.bdbId) : undefined
    if (!bdb) continue
    const senses = senseRecords(bdb)
    // Always overwrite: leaving the previous value behind is what preserved
    // the old "Sense 1: ...; Sense 2: ..." strings on def-less entries.
    entry.definition = definitionText(bdb) || summariseFromSenses(senses) || entry.gloss || ''
    entry.senses = senses
    updated += 1
    if (senses.some((sense) => sense.stem || sense.senses?.length)) structured += 1
  }

  await writeFile(join(generated, 'oshb-lexicon.json'), JSON.stringify(lexicon))
  console.log(`Updated ${updated} entries; ${structured} now carry stem or nested sense structure.`)
}

void main()
