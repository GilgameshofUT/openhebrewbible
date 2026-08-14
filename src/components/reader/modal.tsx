'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Dialog shell providing the keyboard behaviour expected of a modal:
 * Escape closes, Tab is trapped inside, and focus returns to whatever
 * opened it. Also locks background scrolling while open.
 */
export function Modal({
  onClose,
  className,
  labelledBy,
  label,
  children,
}: {
  onClose: () => void
  className: string
  labelledBy?: string
  label?: string
  children: React.ReactNode
}) {
  const dialog = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog so screen readers and keyboards land inside.
    const focusables = () => [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const activeElement = document.activeElement
      if (event.shiftKey && (activeElement === first || !dialog.current?.contains(activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className={className}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div ref={dialog} style={{ display: 'contents' }} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={label}>
        {children}
      </div>
    </div>
  )
}
