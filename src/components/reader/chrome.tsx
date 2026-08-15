'use client'

import { books, type Book, type Division } from '@/data/tanakh'
import { TRANSLATIONS } from '@/lib/translations'
import type { EnglishMode, TranslationId } from './types'

const divisions: Division[] = ['Torah', 'Nevi\'im', 'Ketuvim']

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
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">תנ״ך</span>
        <div>
          <strong>Web Tanakh</strong>
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
      <div className="top-actions">
        <a href="#about">About the sources</a>
        <button className="quiet-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
          Navigate <span>⌄</span>
        </button>
      </div>
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
