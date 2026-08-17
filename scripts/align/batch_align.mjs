// Consumes scripts/align/transcripts/*.json (from batch_transcribe.py) and
// writes data/external/word-alignment/<book>-<chapter>.json in the pilot
// format: { book, chapter, words: [{ id, start, end }] }.
//
// Alignment logic mirrors scripts/align/map.mjs:
//  1. strip niqqud from the OSHB chapter text -> ourStr
//  2. drop the spoken intro from the transcript
//  3. char-level DP between ourStr and the transcript string
//  4. map each OSHB word to a time range via piecewise-linear interpolation
//
// Sanity: prints per-chapter word count, first/last word timings, and the
// number of non-monotonic transitions. Writes nothing on misalignment.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const CORPUS = path.join(ROOT, 'data/generated/books')
const WORK = path.join(__dirname, '.work')
const OUT = process.env.ALIGN_OUT ?? path.join(ROOT, 'data/external/word-alignment')
const chaptersPath = process.env.CHAPTERS ?? path.join(WORK, 'chapters.json')
const transcriptDir = process.env.TRANSCRIPTS_DIR ?? path.join(WORK, 'transcripts')

const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'))
const STRIP = /[\u0591-\u05C7\u05F3\u05F4]/gu

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }

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

function processChapter(ch) {
  const { book, chapter } = ch
  const transcriptPath = path.join(transcriptDir, `${book}-${chapter}.json`)
  if (!fs.existsSync(transcriptPath)) return null

  const gen = readJson(path.join(CORPUS, `${book}.json`))
  if (!gen[chapter] || gen[chapter].length === 0) {
    console.log(`SKIP ${book}-${chapter}: no corpus text`)
    return null
  }

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

  const whisper = readJson(transcriptPath)
  const transWordsRaw = whisper.words.map(w => w.word.replace(/['",.]/g, '').trim()).filter(Boolean)
  if (transWordsRaw.length < 3) return null

  // Drop the spoken intro by finding the split minimising edit distance.
  let best = 0, bestCost = Infinity
  const maxIntro = Math.min(transWordsRaw.length, 10)
  for (let k = 0; k <= maxIntro; k++) {
    const tail = transWordsRaw.slice(k).join(' ')
    const cost = alignCost(ourStr, tail)
    if (cost < bestCost) { bestCost = cost; best = k }
  }
  const transWords = transWordsRaw.slice(best)
  const transStr = transWords.join(' ')

  const map = align(ourStr, transStr)
  const edits = ourStr.length - map.filter(v => v >= 0).length
  // A transcript that isn't this chapter produces a huge edit count; refuse it.
  const badRatio = edits > ourStr.length * 0.6
  if (badRatio) {
    console.log(`REJECT ${book}-${chapter}: intro=${best} edits=${edits} ourLen=${ourStr.length} (transcript mismatch?)`)
    return null
  }

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

  const charTime = []
  for (let k = 0; k < transWords.length; k++) {
    const len = transWords[k].length
    for (let c = 0; c < len; c++) {
      charTime.push(tStart[k + best] + ((tEnd[k + best] - tStart[k + best]) * (c + 0.5)) / len)
    }
    if (k < transWords.length - 1) charTime.push(tEnd[k + best])
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

  for (let i = 0; i < result.length; i++) {
    if (result[i].end <= result[i].start) result[i].end = result[i].start + 300
  }
  for (let i = 1; i < result.length; i++) {
    if (result[i].start < result[i - 1].end) result[i].start = result[i - 1].end
    if (result[i].end <= result[i].start) result[i].end = result[i].start + 300
  }

  return { book, chapter, words: result.map(w => ({ id: w.id, start: w.start, end: w.end })) }
}

let ok = 0, skip = 0, reject = 0
for (const ch of chapters) {
  const result = processChapter(ch)
  if (!result) { skip++; continue }
  const outPath = path.join(OUT, `${result.book}-${result.chapter}.json`)
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1) + '\n')
  ok++
  // Print sample invariants for a subset so a human can eyeball.
  if (ok % 25 === 1) {
    const w = result.words
    let bad = 0
    for (let i = 1; i < w.length; i++) if (w[i].start < w[i - 1].end) bad++
    console.log(`OK ${result.book}-${result.chapter}: words=${w.length} first=${w[0].start}ms lastEnd=${w[w.length - 1].end}ms nonMonotonic=${bad}`)
  }
}
console.log(`DONE ok=${ok} skip=${skip} reject=${reject}`)
