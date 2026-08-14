/**
 * One-off maintenance script: deduplicates top-level rules in globals.css.
 *
 * The stylesheet accumulated 43 duplicated top-level selectors, several with
 * conflicting values that silently fought each other (the resource row bug
 * came from exactly this). This merges same-scope duplicates using CSS's own
 * last-wins semantics, so the rendered result is unchanged while the source
 * keeps one authoritative declaration per selector.
 *
 * Media query blocks are preserved verbatim and in place: their overrides are
 * intentional and must still come after the base rules.
 *
 * Usage: node scripts/dedupe-css.mjs <file>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/dedupe-css.mjs <file>')
  process.exit(1)
}

const source = readFileSync(target, 'utf8')

/** Splits the sheet into top-level rules, media blocks, and comments. */
function tokenize(css) {
  const tokens = []
  let index = 0

  while (index < css.length) {
    // Preserve comments so section headings survive.
    if (css.startsWith('/*', index)) {
      const end = css.indexOf('*/', index + 2)
      const stop = end === -1 ? css.length : end + 2
      tokens.push({ type: 'comment', text: css.slice(index, stop) })
      index = stop
      continue
    }

    if (/\s/.test(css[index])) { index += 1; continue }

    // At-rules (@media, @font-face) are copied through untouched.
    if (css[index] === '@') {
      const braceStart = css.indexOf('{', index)
      if (braceStart === -1) break
      let depth = 1
      let cursor = braceStart + 1
      while (cursor < css.length && depth > 0) {
        if (css[cursor] === '{') depth += 1
        else if (css[cursor] === '}') depth -= 1
        cursor += 1
      }
      tokens.push({ type: 'atrule', text: css.slice(index, cursor) })
      index = cursor
      continue
    }

    const braceStart = css.indexOf('{', index)
    if (braceStart === -1) break
    const braceEnd = css.indexOf('}', braceStart)
    if (braceEnd === -1) break
    tokens.push({
      type: 'rule',
      selector: css.slice(index, braceStart).trim().replace(/\s+/g, ' '),
      body: css.slice(braceStart + 1, braceEnd).trim(),
    })
    index = braceEnd + 1
  }

  return tokens
}

/** Parses a declaration body, preserving order and letting later keys win. */
function parseDeclarations(body) {
  const declarations = new Map()
  let buffer = ''
  let depth = 0

  const flush = () => {
    const declaration = buffer.trim()
    buffer = ''
    if (!declaration) return
    const split = declaration.indexOf(':')
    if (split === -1) return
    const property = declaration.slice(0, split).trim()
    const value = declaration.slice(split + 1).trim()
    if (!property) return
    // Re-setting deletes first so the merged key keeps its latest position.
    declarations.delete(property)
    declarations.set(property, value)
  }

  for (const character of body) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    // Semicolons inside url() or calc() must not split a declaration.
    if (character === ';' && depth === 0) { flush(); continue }
    buffer += character
  }
  flush()

  return declarations
}

const tokens = tokenize(source)

// First pass: merge every top-level rule that shares a selector.
const merged = new Map()
for (const token of tokens) {
  if (token.type !== 'rule') continue
  const existing = merged.get(token.selector)
  const declarations = parseDeclarations(token.body)
  if (!existing) {
    merged.set(token.selector, declarations)
    continue
  }
  for (const [property, value] of declarations) {
    existing.delete(property)
    existing.set(property, value)
  }
}

// Second pass: emit each selector once, at the position of its first
// occurrence, so cascade order relative to media blocks is preserved.
const emitted = new Set()
const output = []
for (const token of tokens) {
  if (token.type === 'comment' || token.type === 'atrule') {
    output.push(token.text)
    continue
  }
  if (emitted.has(token.selector)) continue
  emitted.add(token.selector)
  const declarations = merged.get(token.selector)
  const body = [...declarations].map(([property, value]) => `${property}: ${value};`).join(' ')
  output.push(`${token.selector} { ${body} }`)
}

const result = output.join('\n') + '\n'
writeFileSync(target, result)

const before = tokens.filter((token) => token.type === 'rule').length
console.log(`Merged ${before} top-level rules into ${emitted.size} (removed ${before - emitted.size}).`)
