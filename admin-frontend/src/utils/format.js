export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

export function formatDateTime(value) {
  const numericValue = Number(value || 0)
  if (!numericValue) return 'Unknown'
  const timestamp = numericValue > 10_000_000_000 ? numericValue : numericValue * 1000
  return new Date(timestamp).toLocaleString()
}

export function getRequestSource(record) {
  return record?.sourceFileName || record?.outputFileName || record?.targetLanguage || '-'
}