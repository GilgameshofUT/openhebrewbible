'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="app-shell">
      <section className="boundary-panel">
        <span className="eyebrow">Something went wrong</span>
        <h1>The reader could not load</h1>
        <p>
          This is usually a missing corpus build. Run the importer and the derived build, then try again.
        </p>
        <code>npm run import:oshb &amp;&amp; npm run build:derived</code>
        {error.digest ? <p className="boundary-digest">Reference: {error.digest}</p> : null}
        <button type="button" className="boundary-action" onClick={reset}>Try again</button>
      </section>
    </main>
  )
}
