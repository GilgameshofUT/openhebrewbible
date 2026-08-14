import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '@/components/reader/modal'

afterEach(() => { document.body.innerHTML = ''; document.body.style.overflow = '' })

describe('Modal', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Modal className="modal-backdrop" onClose={onClose} label="Test"><button>Inside</button></Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('moves focus into the dialog on open', () => {
    render(<Modal className="modal-backdrop" onClose={vi.fn()} label="Test"><button>Inside</button></Modal>)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }))
  })

  it('locks background scrolling while open and restores it after', () => {
    const { unmount } = render(<Modal className="modal-backdrop" onClose={vi.fn()} label="Test"><button>Inside</button></Modal>)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('restores focus to the trigger on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = render(<Modal className="modal-backdrop" onClose={vi.fn()} label="Test"><button>Inside</button></Modal>)
    unmount()
    expect(document.activeElement).toBe(trigger)
  })

  it('wraps Tab from the last focusable back to the first', () => {
    render(
      <Modal className="modal-backdrop" onClose={vi.fn()} label="Test">
        <button>First</button>
        <button>Last</button>
      </Modal>,
    )
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    render(
      <Modal className="modal-backdrop" onClose={vi.fn()} label="Test">
        <button>First</button>
        <button>Last</button>
      </Modal>,
    )
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('closes when the backdrop itself is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal className="modal-backdrop" onClose={onClose} label="Test"><button>Inside</button></Modal>,
    )
    fireEvent.mouseDown(container.querySelector('.modal-backdrop')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close when content inside the dialog is clicked', () => {
    const onClose = vi.fn()
    render(<Modal className="modal-backdrop" onClose={onClose} label="Test"><button>Inside</button></Modal>)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
