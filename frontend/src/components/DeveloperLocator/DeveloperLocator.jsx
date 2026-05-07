import { useEffect, useRef, useState } from 'react'
import { isDeveloperMode } from '../../utils/runtimeConfig'
import './DeveloperLocator.css'

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the textarea fallback.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

export default function DeveloperLocator({ code, className = '', style, title }) {
  const [isCopied, setIsCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  if (!isDeveloperMode()) {
    return null
  }

  const handleCopy = async (event) => {
    event.preventDefault()
    event.stopPropagation()

    const copied = await copyTextToClipboard(code)
    if (!copied) {
      return
    }

    setIsCopied(true)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => setIsCopied(false), 1400)
  }

  return (
    <button
      type="button"
      className={`dev-locator-button ${isCopied ? 'is-copied' : ''} ${className}`.trim()}
      data-locator-code={code}
      aria-label={title ? `${title}: ${code}` : code}
      title={title ? `${title}: ${code}` : code}
      onClick={handleCopy}
      style={style}
    >
      {isCopied ? '✓' : '#'}
    </button>
  )
}