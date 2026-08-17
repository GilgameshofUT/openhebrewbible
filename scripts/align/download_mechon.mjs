// Downloads the 907 Mechon Mamre chapter MP3s referenced by the manifest
// generated from data/external/mechon-mamre-chapter-audio.json.
//
// Usage: node scripts/align/download_mechon.mjs [manifest] [outdir]
// Fetches in parallel with a small concurrency cap (mechon-mamre.org is
// served behind Cloudflare; hammering it with hundreds of parallel requests
// tends to get throttled).
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const manifestPath = process.argv[2] ?? '/tmp/opencode/mechon/manifest.json'
const outDir = process.argv[3] ?? '/tmp/opencode/mechon/mp3'

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
fs.mkdirSync(outDir, { recursive: true })

const run = promisify(execFile)
const CONCURRENCY = 12
let done = 0, skipped = 0, failed = 0
const urls = new Set()

async function fetchOne(entry) {
  const dest = path.join(outDir, `${entry.book}-${entry.chapter}.mp3`)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100_000) {
    skipped++
    return
  }
  // Already queued by a duplicate target? The manifest is unique per chapter,
  // but guard against accidental re-queues of the same URL.
  if (urls.has(entry.url)) return
  urls.add(entry.url)
  try {
    await run('curl', ['-fsSL', '--retry', '3', '--max-time', '60', '-o', dest, entry.url])
    done++
  } catch (e) {
    failed++
    console.error(`FAIL ${entry.book}-${entry.chapter}: ${e.message}`)
  }
}

async function main() {
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (manifest.length) {
      const entry = manifest.pop()
      await fetchOne(entry)
    }
  })
  const progress = setInterval(() => {
    const onDisk = fs.readdirSync(outDir).filter((f) => f.endsWith('.mp3')).length
    console.log(`progress downloaded-ish=${onDisk} done=${done} skipped=${skipped} failed=${failed} remaining=${manifest.length}`)
  }, 15000)
  await Promise.all(workers)
  clearInterval(progress)
  console.log(`DONE done=${done} skipped=${skipped} failed=${failed} total=${done + skipped + failed}`)
  process.exit(failed ? 1 : 0)
}

main()