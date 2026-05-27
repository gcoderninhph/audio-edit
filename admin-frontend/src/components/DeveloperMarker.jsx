const DEVELOPER_OVERRIDE_KEY = 'videoforge-admin-react-is-developer'
const ADMIN_REACT_IS_DEVELOPER = false

function normalizeDeveloperValue(value) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) return true
  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) return false
  return null
}

function isDeveloperMode() {
  const searchParams = new URLSearchParams(window.location.search)
  const queryValue = normalizeDeveloperValue(searchParams.get('isDeveloper'))
  if (queryValue !== null) {
    localStorage.setItem(DEVELOPER_OVERRIDE_KEY, queryValue ? '1' : '0')
    return queryValue
  }
  const storedValue = normalizeDeveloperValue(localStorage.getItem(DEVELOPER_OVERRIDE_KEY))
  return storedValue ?? ADMIN_REACT_IS_DEVELOPER
}

export default function DeveloperMarker({ code, title }) {
  if (!isDeveloperMode()) return null

  const handleCopy = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await navigator.clipboard?.writeText(code)
    } catch {
      window.prompt('Developer marker', code)
    }
  }

  return (
    <button type="button" className="dev-marker" title={title || code} aria-label={title || code} onClick={handleCopy}>
      #
    </button>
  )
}