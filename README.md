# Web Tanakh

A Hebrew-first reader for the Tanakh. Every word is clickable and opens its
morphological parse and Brown-Driver-Briggs lexicon entry, with links to
manuscript scans, chapter audio, and study videos.

Hebrew is the primary text. English translations are joined to it through an
explicit versification map rather than assuming the numbering lines up — it
frequently does not.

- **Text**: Open Scriptures Hebrew Bible (WLC), release `v.2.2`, SHA-256 pinned
- **Lexicon**: Brown-Driver-Briggs, 9,299 entries
- **Translations**: JPS 1917, KJV, World English Bible, Young's Literal Translation, Berean Standard Bible, and Sefaria Community Translation
- **Scale**: 39 books, 23,213 verses, 305,507 morphologically tagged words

---

## Quick start

```bash
npm install
npm run import:oshb       # fetches the pinned OSHB corpus + BDB lexicon (~45 s)
npm run import:citations  # builds the Jewish -> Christian versification map
npm run build:derived     # splits the corpus per book, indexes lemmas
npm run dev
```

**All three data steps are required.** No corpus data is committed — it is
generated from pinned upstream sources, which keeps the repository at ~9 MB
instead of ~110 MB. Without them the API returns 503.

The additional English translations (WEB, YLT, BSB, SCT) are committed in
`data/sources/<id>/`, already converted to the Jewish versification, so they
need no build step. Regenerate them only if the pinned sources change:

The output is reproducible: regenerating from a clean clone produces a corpus
byte-identical to the previous build (SHA-256 recorded in
`data/generated/manifest.json`).

> **Regenerating data? Restart the dev server.** Parsed artifacts are memoised
> at module scope, so a running server keeps serving the old data.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run check` | Typecheck + lint + tests (run before committing) |
| `npm test` | Run the test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run import:oshb` | Import the pinned OSHB release and BDB lexicon |
| `npm run import:citations` | Build the Jewish→Christian versification map |
| `npm run import:translations` | Re-import WEB, YLT, BSB, SCT from pinned sources |
| `npm run build:derived` | Derive per-book files and the occurrence index |
| `npm run catalog:external` | Rebuild external resource catalogues |

Maintenance scripts, for repairing generated data without a network re-import:

| Script | Purpose |
| --- | --- |
| `scripts/rebuild-translations.ts` | Re-apply JPS text from the cached source |
| `scripts/rebuild-lexicon-senses.ts` | Re-parse BDB sense structure |
| `scripts/dedupe-css.mjs` | Merge duplicate CSS rules (last-wins) |

These read `data/sources/`, which is gitignored — they only work after
`npm run import:oshb` has populated the cache.

`catalog:leningrad`, `report:gilgamesh`, and `apply:gilgamesh` are one-off
research scripts kept for provenance; they are not part of a normal build.

---

## Architecture

```
src/
  app/
    api/{chapter,notes,occurrences,audio}/route.ts   validated JSON endpoints
    error.tsx  not-found.tsx  globals.css
  lib/
    books.ts      canonical book table, reference parsing, input validation
    corpus.ts     memoised data access
    text.ts       translation markup normalisation
  components/reader/
    index.tsx           composition and state
    chrome.tsx          top bar, nav drawer, toolbars
    passage.tsx         single-column and parallel views
    hebrew-text.tsx     the one word/verse renderer
    study-panel.tsx     lexicon entry and BDB sense outline
    chapter-resources.tsx
    modal.tsx modals.tsx
    use-{audio,notes,reading-position}.ts
```

Three decisions worth knowing:

**Corpus access is memoised per process.** `src/lib/corpus.ts` caches each
artifact's parsed *promise* at module scope, so a file is read once per server
process and concurrent cold requests share one read rather than racing. Reading
the 57 MB corpus per request previously cost ~250 ms and ~216 MB of heap churn;
warm chapter requests are now ~4 ms.

**Occurrences come from a precomputed index.** Finding every verse containing a
lemma used to scan all 305,507 words. `build:derived` writes a lemma→verse index,
turning that into a single lookup.

**Book identity is shared between client and server.** `src/lib/books.ts` is the
one book table. The API validates against exactly the list the UI can navigate
to, so an unknown book can never reach a file path or an outbound URL.

---

## Data pipeline

```
data/sources/      raw upstream files          (gitignored, except the translation dirs)
      ↓  npm run import:oshb
data/generated/    corpus, lexicon, manifest   (committed)
      ↓  npm run build:derived
data/generated/books/, occurrence-index.json   (gitignored, derived)
```

| File | Contents | Committed |
| --- | --- | --- |
| `manifest.json` | Source release, SHA-256, counts — the provenance record | **yes** |
| `sources/kjv/*.json` | KJV text, read at runtime | **yes** |
| `sources/web/*.json` | World English Bible (converted to Jewish versification) | **yes** |
| `sources/ylt/*.json` | Young's Literal Translation (converted) | **yes** |
| `sources/bsb/*.json` | Berean Standard Bible (converted) | **yes** |
| `sources/sct/*.json` | Sefaria Community Translation (29 books, partial) | **yes** |
| `oshb-corpus.json` | Full corpus, 57 MB | no |
| `oshb-lexicon.json` | BDB entries keyed by lemma | no |
| `jewish-to-christian-citation-map.json` | Jewish→Christian versification | no |
| `books/<id>.json` | Per-book chapters, read at request time | no |
| `occurrence-index.json` | Lemma → verse references | no |

### Two things that will trip you up

**Jewish versification is canonical.** Christian chapter and verse numbers are
mapped through `jewish-to-christian-citation-map.json`. Psalms and Joel diverge
substantially. Never assume alignment.

**Translation files are pre-converted to Jewish versification.** Christian
editions (KJV, WEB, YLT, BSB) are converted once at import time
(`npm run import:translations`) and stored under `data/sources/<id>/` in the
corpus's own numbering, so the reader never converts at request time. Because
the Christian editions end Numbers 25, 1 Chronicles 12, and some Psalms one
verse earlier, five Jewish verses have no text in any edition (`num:25:19`,
`chr1:12:41`, `ps:52:11`, `ps:75:11`, `ps:142:8`). Edit the committed files
directly to fix translation errors.

**Lexicon keys are not entry ids.** `oshb-lexicon.json` is keyed by Strong's-style
numbers (`"1"`, `"2"`), while each entry's `id` is an opaque code (`"aac"`,
`"nyw"`). They differ for all 9,299 entries. To collect every key for an entry:

```ts
const keys = new Set(Object.keys(lexicon).filter((k) => lexicon[k].id === entryId))
```

---

## Testing

```bash
npm test
```

49 tests across four files:

| File | Covers |
| --- | --- |
| `books.test.ts` | Reference parsing, abbreviations, Hebrew names, input validation |
| `hebrew-display.test.tsx` | Qere tooltip, sof pasuq spacing, CSS deduplication |
| `lexicon-data.test.ts` | Generated data shape, checked against the BDB source |
| `modal.test.tsx` | Escape, focus trap, focus restoration, scroll lock |

Two conventions worth preserving:

**Regression tests are verified to fail.** Each was confirmed to break when the
thing it guards is removed. A test that has never failed proves nothing.

**Data-shape tests skip when derived artifacts are missing**, so a fresh clone
does not report false failures before `build:derived` has run.

---

## Deployment

The app needs a Node.js runtime. It **cannot** run on GitHub Pages or any
static-only host, because the API route handlers read query parameters at
request time — which Next.js forbids under `output: 'export'`.

A small VPS (1–2 GB RAM) or any container host works. A Dockerfile is included
that fetches the corpus during the build, so the image is self-contained.

```bash
docker build -t web-tanakh .
docker run -d -p 127.0.0.1:3000:3000 --restart unless-stopped web-tanakh
```

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for full VPS setup, including Nginx, TLS,
systemd, and operations.

---

## Accessibility

- Hebrew containers carry `lang="he"` so screen readers use a Hebrew voice.
- Every word is a real button with an accessible name of lemma, parse, and qere.
- Modals trap Tab, close on Escape, restore focus to the trigger, and lock
  background scroll.
- View-mode and audio-source toggles report `aria-pressed`.

Known gap: a chapter renders hundreds of word buttons, each a tab stop. Roving
`tabindex` would be an improvement.

---

## Known gaps

- **Passages are not URL-addressable.** Book and chapter live in component state
  and `localStorage`, so a passage cannot be linked or shared, and the back
  button does not navigate. Moving to `/[book]/[chapter]` is the main outstanding
  feature.
- **`npm audit` reports advisories** in the pinned Next release and in the
  dev-only esbuild used by Vitest. Both need a deliberate upgrade pass.
- **Occurrence results are capped at 500** per lemma with no paging.

---

## Documentation

| Document | Contents |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Working practices — **read before changing code** |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | VPS deployment, Docker, Nginx, TLS, operations |
| [`NOTICE`](NOTICE) | Third-party texts, lexicon, and font, with their licenses |

Planning documents, research notes, and one-off provenance scripts live in
`local/`, which is gitignored. They are not required to build or run the app.

---

## Licensing

The application source is MIT licensed. Bundled third-party content is not:

| Content | License |
| --- | --- |
| Open Scriptures Hebrew Bible (WLC) | CC BY 4.0 |
| Brown-Driver-Briggs lexicon | CC BY 4.0 (public domain original) |
| JPS 1917 | Public domain |
| KJV | Public domain in the US; Crown copyright in the UK |
| Ezra SIL font | SIL Open Font License 1.1 |

External audio, video, and manuscript imagery are linked or embedded from
their original providers, never copied or rehosted. See [`NOTICE`](NOTICE) for
full attribution.
