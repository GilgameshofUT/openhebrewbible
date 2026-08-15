'use client'

import { useState } from 'react'
import { books, type Book, type Division } from '@/data/tanakh'
import { TRANSLATIONS } from '@/lib/translations'
import { Modal } from './modal'
import type { EnglishMode, TranslationId } from './types'

const divisions: Division[] = ['Torah', 'Nevi\'im', 'Ketuvim']

const REPO_URL = 'https://github.com/GilgameshofUT/openhebrewbible'
const CHANNEL_URL = 'https://www.youtube.com/@GilgameshofUtah'

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/** Credits for the texts, lexicon, font, and linked resources the reader uses. */
function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal className="modal-backdrop" onClose={onClose} labelledBy="about-title">
      <section className="about-modal">
        <header>
          <div>
            <span className="label">About</span>
            <h2 id="about-title">Sources</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close sources">×</button>
        </header>
        <ul className="about-credits">
          <li>
            <strong>Hebrew text</strong>
            <span>Open Scriptures Hebrew Bible — Westminster Leningrad Codex with morphological tagging · <a href="https://github.com/openscriptures/morphhb" target="_blank" rel="noreferrer">openscriptures/morphhb</a> · CC BY 4.0</span>
          </li>
          <li>
            <strong>Lexicon</strong>
            <span>Brown-Driver-Briggs Hebrew and English Lexicon (1906, public domain), machine-readable encoding by Open Scriptures · <a href="https://github.com/openscriptures/HebrewLexicon" target="_blank" rel="noreferrer">openscriptures/HebrewLexicon</a> · CC BY 4.0</span>
          </li>
          <li>
            <strong>Translations</strong>
            <span>JPS 1917 (public domain) · King James Version (public domain in the US) · World English Bible (public domain) · Young's Literal Translation (public domain) · Berean Standard Bible (public domain, CC0)</span>
          </li>
          <li>
            <strong>Font</strong>
            <span>Ezra SIL · <a href="https://software.sil.org/ezra/" target="_blank" rel="noreferrer">software.sil.org/ezra</a> · SIL Open Font License 1.1</span>
          </li>
          <li>
            <strong>Audio</strong>
            <span>Project 929 — Omer Frenkel reads each chapter; embedded from SoundCloud. Mechon Mamre recordings are linked from mechon-mamre.org.</span>
          </li>
          <li>
            <strong>Manuscripts</strong>
            <span>Leningrad Codex (1008 CE) page images — West Semitic Research (Bruce Zuckerman, USC), courtesy of the Russian National Library; hosted by the <a href="https://www.sefaria.org/manuscripts" target="_blank" rel="noreferrer">Sefaria manuscript viewer</a>.</span>
          </li>
        </ul>
      </section>
    </Modal>
  )
}

export function TopBar({
  referenceQuery,
  setReferenceQuery,
  onNavigateReference,
  menuOpen,
  setMenuOpen,
}: {
  referenceQuery: string
  setReferenceQuery: (value: string) => void
  onNavigateReference: (value: string) => void
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
}) {
  const [aboutOpen, setAboutOpen] = useState(false)
  return (
    <header className="topbar">
      <div className="topbar-start">
        <div className="brand">
          <span className="brand-mark">תנ״ך</span>
          <div>
            <strong>Open Hebrew Bible</strong>
            <span>read closely</span>
          </div>
        </div>
        <div className="reference-nav">
          <label htmlFor="reference-search">Go to</label>
          <div className="reference-field">
            <input
              id="reference-search"
              value={referenceQuery}
              onChange={(event) => setReferenceQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') onNavigateReference(referenceQuery) }}
              placeholder="Gen 1:1 or Genesis 1:1"
            />
            <button onClick={() => onNavigateReference(referenceQuery)}>Go</button>
          </div>
        </div>
        <button className="quiet-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
          Navigate <span>⌄</span>
        </button>
      </div>
      <div className="top-actions">
        <button type="button" className="about-button" onClick={() => setAboutOpen(true)}>About the sources</button>
        <a className="social-link" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Open Hebrew Bible on GitHub"><GitHubIcon /></a>
        <a className="social-link" href={CHANNEL_URL} target="_blank" rel="noreferrer" aria-label="Hebrew Bible with Gilgamesh on YouTube"><img className="social-avatar" src="/gilgamesh-profile.jpg" alt="" /></a>
      </div>
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </header>
  )
}

export function NavigationDrawer({
  query,
  setQuery,
  onNavigate,
  currentBookId,
  onSelectBook,
}: {
  query: string
  setQuery: (value: string) => void
  onNavigate: (value: string) => void
  currentBookId: string
  onSelectBook: (book: Book) => void
}) {
  return (
    <nav className="navigation-drawer" aria-label="Tanakh navigation">
      <div className="nav-search">
        <label htmlFor="book-search">Book or abbreviation</label>
        <div className="search-field">
          <input
            id="book-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') onNavigate(query) }}
            placeholder="Genesis, Gen, בראשית"
          />
          <button onClick={() => onNavigate(query)}>Open</button>
        </div>
      </div>
      <div className="division-grid">
        {divisions.map((division) => (
          <section key={division}>
            <h3>{division}</h3>
            {books.filter((item) => item.division === division).map((item) => (
              <button
                key={item.id}
                className={item.id === currentBookId ? 'book-link active' : 'book-link'}
                onClick={() => onSelectBook(item)}
              >
                <span>{item.name}</span>
                <small>{item.hebrewName}</small>
              </button>
            ))}
          </section>
        ))}
      </div>
    </nav>
  )
}

export function ContextBar({
  book,
  chapter,
  setChapter,
}: {
  book: Book
  chapter: number
  setChapter: (chapter: number) => void
}) {
  return (
    <section className="context-bar">
      <div>
        <span className="eyebrow">{book.division}</span>
        <h1>{book.name} <span>{book.hebrewName}</span></h1>
      </div>
      <div className="chapter-control">
        <button disabled={chapter <= 1} onClick={() => setChapter(chapter - 1)} aria-label="Previous chapter">←</button>
        <label>
          Chapter
          <select value={chapter} onChange={(event) => setChapter(Number(event.target.value))}>
            {Array.from({ length: book.chapters }, (_, index) => (
              <option key={index + 1} value={index + 1}>{index + 1}</option>
            ))}
          </select>
        </label>
        <button disabled={chapter >= book.chapters} onClick={() => setChapter(chapter + 1)} aria-label="Next chapter">→</button>
      </div>
    </section>
  )
}

export function ReaderToolbar({
  englishMode,
  setEnglishMode,
  translation,
  setTranslation,
}: {
  englishMode: EnglishMode
  setEnglishMode: (mode: EnglishMode) => void
  translation: TranslationId
  setTranslation: (translation: TranslationId) => void
}) {
  const modes: Array<[EnglishMode, string]> = [
    ['hidden', 'Hebrew only'],
    ['beneath', 'English beneath'],
    ['parallel', 'Parallel'],
  ]
  return (
    <section className="reader-toolbar">
      <div className="toolbar-group">
        {modes.map(([mode, label]) => (
          <button
            key={mode}
            className={englishMode === mode ? 'toolbar-button selected' : 'toolbar-button'}
            aria-pressed={englishMode === mode}
            onClick={() => setEnglishMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <select
          className="translation-select"
          aria-label="Translation"
          value={translation}
          onChange={(event) => setTranslation(event.target.value as TranslationId)}
        >
          <option value="jps">JPS 1917</option>
          {TRANSLATIONS.filter((item) => !item.embedded).map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>
    </section>
  )
}
