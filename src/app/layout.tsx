import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Web Tanakh',
  description: 'A Hebrew-first reader for the Tanakh with morphology and lexicon study tools.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
