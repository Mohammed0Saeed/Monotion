import { useRef, useState } from 'react'

/** Text input that saves on Enter/blur and cancels on Escape. With keepOpen, Enter saves and clears for the next entry. */
export default function InlineInput({ initial = '', placeholder, className = '', keepOpen = false, onSubmit, onClose }: {
  initial?: string
  placeholder: string
  className?: string
  keepOpen?: boolean
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const closed = useRef(false)

  function commit(close: boolean) {
    if (closed.current) return
    const v = value.trim()
    if (v && v !== initial) onSubmit(v)
    if (close || !keepOpen) { closed.current = true; onClose() } else setValue('')
  }

  return (
    <input
      className={'inline-input ' + className} autoFocus value={value}
      placeholder={placeholder} aria-label={placeholder}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(false) }
        if (e.key === 'Escape') { closed.current = true; onClose() }
      }}
      onBlur={() => commit(true)}
    />
  )
}
