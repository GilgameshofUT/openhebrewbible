import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const bookId = argValue('--book') ?? 'gen'
const chapter = argValue('--chapter') ?? '1'
const transcriptPath = argValue('--transcript') ?? path.join(__dirname, 'out_medium.json')
const outPath = argValue('--out') ?? path.join(__dirname, 'aligned.json')
const corpusPath = argValue('--corpus') ?? '/home/abba/codeprojects/Web-Tanakh/data/generated/books'

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const gen = readJson(path.join(corpusPath, `${bookId}.json`))

const STRIP = /[\u0591-\u05C7\u05F3\u05F4]/gu

const ourWords = []
const ourStrParts = []
for (const v of gen[chapter]) {
  for (const w of v.words) {
    const plain = w.text.replace(STRIP, '')
    ourWords.push({ id: w.id, text: w.text, plain })
    ourStrParts.push(plain)
  }
}
const ourStr = ourStrParts.join(' ')

const whisper = readJson(path.resolve(transcriptPath))
const transWordsRaw = whisper.words.map(w => w.word.replace(/['",.]/g, '').trim()).filter(Boolean)

function alignCost(a, b) {
  const n = a.length, m = b.length
  let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1)
  for (let j = 0; j <= m; j++) prev[j] = j
  for (let i = 1; i <= n; i++) {
    cur[0] = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const t = prev; prev = cur; cur = t
    cur.fill(0)
  }
  return prev[m]
}

// The recordings open with a short spoken intro ("…פרק א") that is not part of
// the text. Find the split of the transcript after which the remaining words
// match the chapter text with fewest edits; drop the intro words before it.
function dropIntro(transWords) {
  let best = 0, bestCost = Infinity
  const maxIntro = Math.min(transWords.length, 10)
  for (let k = 0; k <= maxIntro; k++) {
    const tail = transWords.slice(k).join(' ')
    const cost = alignCost(ourStr, tail)
    if (cost < bestCost) { bestCost = cost; best = k }
  }
  console.error(`intro words dropped: ${best} (best cost ${bestCost})`)
  return { words: transWords.slice(best), offset: best }
}

const { words: transWords, offset } = dropIntro(transWordsRaw)
const transStr = transWords.join(' ')

function align(a, b) {
  const n = a.length, m = b.length
  const d = new Int32Array((n + 1) * (m + 1))
  for (let i = 0; i <= n; i++) d[i * (m + 1)] = i
  for (let j = 0; j <= m; j++) d[j] = j
  for (let i = 1; i <= n; i++) {
    const ai = a.charCodeAt(i - 1)
    const row = i * (m + 1), prev = (i - 1) * (m + 1)
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      const del = d[prev + j] + 1
      const ins = d[row + j - 1] + 1
      const sub = d[prev + j - 1] + cost
      d[row + j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub)
    }
  }
  let i = n, j = m
  const map = new Array(n).fill(-1)
  while (i > 0 && j > 0) {
    const row = i * (m + 1)
    const cur = d[row + j]
    if (i > 0 && j > 0 && cur === d[(i - 1) * (m + 1) + j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)) {
      map[i - 1] = j - 1; i--; j--
    } else if (i > 0 && cur === d[(i - 1) * (m + 1) + j] + 1) {
      i--
    } else {
      j--
    }
  }
  return map
}

const map = align(ourStr, transStr)
const edits = ourStr.length - map.filter(v => v >= 0).length
console.error(`our chars: ${ourStr.length}, trans chars: ${transStr.length}, deleted chars: ${edits}`)

// Every deleted our-char borrows the nearest mapped neighbour so word start/end
// lookups never escape into a far-away transcript region.
let last = -1
for (let i = 0; i < map.length; i++) {
  if (map[i] >= 0) last = map[i]
  else if (last >= 0) map[i] = last
}
last = -1
for (let i = map.length - 1; i >= 0; i--) {
  if (map[i] >= 0) last = map[i]
  else if (last >= 0) map[i] = last
}
if (map[0] < 0) map[0] = 0

const tStart = [], tEnd = []
for (const w of whisper.words) {
  tStart.push(w.start)
  tEnd.push(w.end)
}

// Time as a piecewise-linear function of transcript character position, built
// over transStr EXACTLY (spaces included, at word boundaries) so that map[]
// indices index straight into charTime. A merged transcript token yields
// smooth sub-word boundaries instead of snapped ones.
const charTime = []
for (let k = 0; k < transWords.length; k++) {
  const len = transWords[k].length
  for (let c = 0; c < len; c++) {
    charTime.push(tStart[k + offset] + ((tEnd[k + offset] - tStart[k + offset]) * (c + 0.5)) / len)
  }
  if (k < transWords.length - 1) charTime.push(tEnd[k + offset])
}

function timeAt(pos) {
  if (pos < 0) return 0
  if (pos >= charTime.length) return tEnd[tEnd.length - 1]
  return charTime[pos]
}

let cursor = 0
const result = []
for (const w of ourWords) {
  const startChar = cursor
  const endChar = startChar + w.plain.length
  cursor = endChar + 1
  const start = timeAt(map[startChar])
  const end = timeAt(map[endChar - 1] + 1)
  result.push({ id: w.id, text: w.text, plain: w.plain, start: Math.round(start * 1000), end: Math.round(end * 1000) })
}

// Safety net only: the character mapping is monotonic, so these should never fire.
for (let i = 0; i < result.length; i++) {
  if (result[i].end <= result[i].start) result[i].end = result[i].start + 300
}
for (let i = 1; i < result.length; i++) {
  if (result[i].start < result[i - 1].end) result[i].start = result[i - 1].end
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 1))
let bad = 0
for (let i = 1; i < result.length; i++) if (result[i].start < result[i - 1].end) bad++
console.error(`words: ${result.length}, non-monotonic transitions: ${bad}`)
console.error(`first word: ${JSON.stringify(result[0])}`)
console.error(`last word: ${JSON.stringify(result[result.length - 1])}`)
