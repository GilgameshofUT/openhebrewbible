import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Open Hebrew Bible',
  description: 'A Hebrew-first reader for the Tanakh with morphology and lexicon study tools.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/SILEOT.woff" as="font" type="font/woff" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
