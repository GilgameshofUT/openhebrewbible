# Working on Web Tanakh

Instructions for AI agents. Read this before changing anything.

This project has a specific failure mode: **the same visual bugs kept coming
back**. The qere tooltip was implemented and lost at least three times. The
chapter-resource styling was pasted three times into one stylesheet, each copy
fighting the others. Two separate data bugs sat undetected in generated files
for months because nobody looked at the rendered page closely enough.

The rules below exist to stop that recurring. Follow them.

---

## 1. The non-negotiables

1. **Commit a checkpoint before you start.** If the working tree is dirty, commit
   it as-is first, so there is a clean rollback point.
2. **Run `npm run check` before every commit.** Typecheck, lint, and tests.
3. **Look at the page.** If you changed anything a user can see, open it in a
   browser and look at it. See §4.
4. **Verify your tests actually fail.** A regression test you have not seen fail
   is not a regression test. See §5.
5. **Never claim something works because the code looks right.** Check the
   output. See §6.

---

## 2. Before you change code

```bash
git status --short          # dirty? commit a checkpoint first
npm run check               # know whether it was already broken
```

If `npm run check` fails before you touch anything, say so and fix or report it
separately. Do not silently absorb a pre-existing failure into your change.

### Understand which layer you are in

| Layer | Location | What breaks here |
| --- | --- | --- |
| Source data | `data/sources/` (gitignored) | Upstream markup you do not control |
| Import scripts | `scripts/` | Parsers that silently drop data |
| Generated data | `data/generated/` | Wrong content, invisible in code review |
| Server | `src/lib/`, `src/app/api/` | Caching, validation, performance |
| Client | `src/components/reader/` | Rendering, interaction, accessibility |
| Styling | `src/app/globals.css` | Duplicate rules fighting each other |

**A bug in the rendered page is not always a bug in the rendering code.** Two of
the defects fixed in this codebase were in generated data. Before editing a
component, check what the API actually returns and what is actually on disk.

---

## 3. The debugging order that works here

Work outward from the data. Do not start at the component.

```bash
# 1. What is on disk?
node -e "const b=require('./data/generated/books/isa.json'); console.log(JSON.stringify(b['10'].find(v=>v.number===15),null,1))"

# 2. What does the API return?
curl -s "http://localhost:3000/api/chapter?book=isa&chapter=10" | node -e "..."

# 3. What is in the DOM?     -> browser.snapshot
# 4. What does it look like? -> browser.capture, then read the image
```

If step 1 is already wrong, no amount of component work will fix it.

### Worked example: the JPS line-break bug

The rendered page showed `"...that heweth therewith?Should the saw..."` with a
missing space. That looks like a CSS or rendering bug. It was not.

1. Checked the generated book file — the text was already run together on disk.
2. Checked the raw source — it contained `<po2>` markers.
3. Checked the importer — the regex was `/<p\d+>/`, which does **not** match
   `<po2>`.
4. Counted the markers: `<po#>` appeared **13,724 times**; `<p#>` appeared
   **zero** times. The regex had never matched anything in the project's life.

Fixing the component would have been impossible. The evidence was three shell
commands away.

---

## 4. Look at the page

You have a browser. Use it. Text output is not sufficient for visual work.

```
browser.open      { url: "http://localhost:3000/", viewport: "desktop" }
browser.snapshot  { selector: ".study-panel" }   # text + interactive elements + console errors
browser.capture   { label: "after-fix" }         # then READ the returned image path
browser.inspect   { selector: ".verse-end-mark" }# computed styles
```

- `browser.snapshot` reports console errors. Check them. A React key warning in
  that output revealed two real bugs in this codebase.
- `browser.capture` returns a path — **read the image**. Capturing without
  looking proves nothing.
- For spacing, colour, or alignment questions, prefer `browser.inspect`.
  Computed styles are objective; a JPEG is not.

### Screenshots cannot prove everything

A static capture cannot trigger `:hover` or `:focus`. When verifying a hover
tooltip, verify the *mechanism* instead — the attribute is in the DOM, the CSS
rule reads it — and **say plainly that you did not visually confirm the hover
state**. Do not imply verification you did not perform.

---

## 5. Testing

```bash
npm test                       # all
npx vitest run tests/x.test.ts # one file
```

### Prove the test works

Break the thing on purpose, watch the test fail, then restore:

```bash
cp src/app/globals.css /tmp/backup.css
# remove the rule under test
npx vitest run                 # EXPECT FAILURE — if it passes, the test is worthless
cp /tmp/backup.css src/app/globals.css
npx vitest run                 # confirm restored
```

This is not optional for regression tests. A test that has never failed is
decoration.

### Test the invariant, not a proxy for it

A real mistake made in this codebase: to check that lexicon definitions were not
absorbing their sense tree, the first attempt asserted
`definition.length < senses.length * 0.8`. That produced false positives on
entries where definition was `"learn"` and senses were `"teach"` — both five
characters. The heuristic measured nothing.

The replacement parses the BDB XML, extracts the `<def>` tags that appear before
the first `<sense>`, and asserts the stored definition equals exactly those. It
tests the actual rule.

**If a test needs a magic threshold to pass, you are probably testing the wrong
thing.**

### Data-shape tests

Bugs in `data/generated/` are invisible to typecheck, lint, and component tests.
`tests/lexicon-data.test.ts` asserts against the generated files and skips
cleanly when the gitignored derived artifacts are absent:

```ts
const derived = existsSync(booksPath) && existsSync(lexiconPath)
const maybe = derived ? describe : describe.skip
```

Follow that pattern for any test that reads generated data.

---

## 6. Honesty rules

- If you verified a mechanism but not the visual result, **say which**.
- If a number is measured, show the measurement. If it is estimated, say so.
- If you fixed one entry and did not audit the rest, **say so** — asked "is the
  lexicon in good shape now?", an audit of all 9,299 entries found 96 still
  broken that a spot check had missed.
- If a check fails for a pre-existing reason, report it; do not fold it into
  your change silently.
- Never write "should work" or "this fixes it" without having run something.

---

## 7. Committing

Commit in coherent units. One commit per logical change, not one per session.

```bash
git status --short   # stage intentionally; never `git add -A` without looking
npm run check        # must pass
```

Write commit messages that explain **why**, and record the evidence:

```
fix: restore JPS poetic line breaks

The JPS source marks poetic lines with <po1>, <po2>, ... but the importer
matched only /<p\d+>/, which does not match <po2>. All 13,724 markers were
stripped with no replacement, concatenating lines and swallowing the space.

There is no <p1>-style tag in this source at all, so the regex had never
matched anything.

7,625 verses corrected. Verified: 47 tests pass, and the new data-shape
tests were confirmed to fail against the pre-fix corpus.
```

State counts, state what you verified, state what you did not.

---

## 8. Project-specific traps

### Regenerating data requires a dev server restart

`src/lib/corpus.ts` memoises each parsed artifact at module scope. That is
deliberate — it took chapter requests from ~250 ms to ~4 ms. But it means:

> **After running any import or rebuild script, restart `npm run dev`.**
> Otherwise the API serves the old data and you will debug a phantom.

This wasted real time in a previous session. Do not repeat it.

### `data/sources/` is gitignored, with exceptions

- The raw XML and JPS files are **not** in a fresh clone. The
  `scripts/rebuild-*.ts` scripts read them, so they only work after
  `npm run import:oshb` has populated the cache.
- The translation texts `data/sources/{kjv,web,ylt,bsb}/` **are** tracked
  and are read at runtime by `src/lib/corpus.ts`. They are
  generated once by `scripts/import-translations.ts`, converted to the Jewish
  versification, and committed so errors can be fixed by hand. Do not "clean
  up" that inconsistency without checking `git ls-files data/sources` first,
  and regenerate them with `npm run import:translations` if you change the
  pinned sources.

### Derived artifacts are gitignored

`data/generated/books/` and `occurrence-index.json` are not committed. A fresh
clone must run `npm run build:derived` or the reader returns 503.

### Never edit `globals.css` by appending

Three copies of `.chapter-resources` accumulated that way; the last one dropped
the container padding and broke the layout. Before adding a rule:

```bash
grep -n "^\.your-selector {" src/app/globals.css   # must return at most one line
```

`scripts/dedupe-css.mjs` merges duplicates using CSS last-wins semantics. When it
was run against the 43 duplicated selectors, the effective cascade was verified
identical before and after — same declaration count, no value changed. Re-verify
that way if you run it again; do not assume.

### One render site per concept

The qere attribute kept going missing because word rendering existed in two
places that had to be kept in sync. It now lives only in
`src/components/reader/hebrew-text.tsx`, and a test asserts every `wordClass(`
call site also emits `data-qere`. Do not reintroduce a second copy.

### Jewish versification is canonical

English editions are joined through `jewish-to-christian-citation-map.json`. Never
assume Jewish and Christian chapter/verse numbers align — they frequently do not,
especially in Psalms and Joel.

### Lexicon keys are not entry ids

`oshb-lexicon.json` is keyed by Strong's-style numbers (`"1"`, `"2"`), but each
entry's `id` is an opaque code (`"aac"`, `"nyw"`). **They differ for all 9,299
entries.** Confusing them silently returns zero results. To find every key for an
entry:

```ts
const keys = new Set(Object.keys(lexicon).filter((k) => lexicon[k].id === entryId))
```

---

## 9. Code conventions

- TypeScript strict. `npm run typecheck` must pass.
- Comments explain **why**, not what. Prefer none over restating the code.
- Keep JSX readable — one element per line. The old `reader.tsx` had 2,000+
  character single-line JSX statements; every edit rewrote the whole line in the
  diff, which is part of why bugs kept reappearing.
- Validate untrusted input at the boundary. `validateBookChapter` returns a
  discriminated union so the API can report the real reason, not a generic 404.
- Share logic rather than duplicating it: `src/lib/books.ts` (identity),
  `src/lib/text.ts` (markup), `src/lib/corpus.ts` (data access). Duplicated
  regex pipelines in this codebase had already drifted apart.

---

## 10. Definition of done

- [ ] `npm run check` passes
- [ ] `npm run build` passes for non-trivial changes
- [ ] Visual changes viewed in the browser, image actually read
- [ ] New regression tests observed failing before the fix
- [ ] Data changes verified by inspecting the generated file, not just the code
- [ ] Dev server restarted if data was regenerated
- [ ] Committed with an explanatory message
- [ ] Limits of your verification stated plainly
