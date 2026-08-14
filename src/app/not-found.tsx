import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="app-shell">
      <section className="boundary-panel">
        <span className="eyebrow">Not found</span>
        <h1>That page does not exist</h1>
        <p>The passage or page you requested is not part of this reader.</p>
        <Link className="boundary-action" href="/">Return to the reader</Link>
      </section>
    </main>
  )
}
