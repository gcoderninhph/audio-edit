import { useEffect, useMemo, useState } from 'react'
import { estimateCreateSubCredits } from '../../utils/subtitleUtils'

const INITIAL_STATE = Object.freeze({
  creditCost: null,
  error: '',
  estimate: null,
  isLoading: false,
  signature: '',
})

function buildSignature({ durationSeconds, originSubtitles, targetLanguageKey }) {
  return JSON.stringify({
    durationSeconds: Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null,
    originSubtitles: Array.isArray(originSubtitles)
      ? originSubtitles.map((subtitle) => ({
        end: Number(subtitle?.end || 0),
        start: Number(subtitle?.start || 0),
        text: String(subtitle?.text || '').trim(),
      })).filter((subtitle) => subtitle.text)
      : [],
    targetLanguageKey: String(targetLanguageKey || ''),
  })
}

export function useCreateSubCreditEstimate({ enabled, durationSeconds, originSubtitles, targetLanguageKey }) {
  const signature = useMemo(() => buildSignature({ durationSeconds, originSubtitles, targetLanguageKey }), [durationSeconds, originSubtitles, targetLanguageKey])
  const [state, setState] = useState(INITIAL_STATE)
  const shouldEstimate = Boolean(enabled && targetLanguageKey)

  useEffect(() => {
    if (!shouldEstimate) {
      return undefined
    }

    let isDisposed = false
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()
    const timeoutId = window.setTimeout(async () => {
      try {
        setState((current) => ({ ...current, error: '', isLoading: true, signature }))
        const response = await estimateCreateSubCredits({ durationSeconds, originSubtitles, signal: controller?.signal })
        if (isDisposed) return
        const creditCost = Number(response?.creditCost ?? response?.estimate?.creditCost)
        setState({
          creditCost: Number.isFinite(creditCost) ? Math.max(0, Math.ceil(creditCost)) : null,
          error: '',
          estimate: response?.estimate || null,
          isLoading: false,
          signature,
        })
      } catch (error) {
        if (isDisposed || error?.name === 'AbortError') return
        setState({
          creditCost: null,
          error: error?.message || 'Unable to estimate Create Sub credits',
          estimate: null,
          isLoading: false,
          signature,
        })
      }
    }, 300)

    return () => {
      isDisposed = true
      window.clearTimeout(timeoutId)
      controller?.abort()
    }
  }, [durationSeconds, originSubtitles, shouldEstimate, signature])

  if (!shouldEstimate) {
    return INITIAL_STATE
  }
  if (state.signature !== signature) {
    return { ...INITIAL_STATE, isLoading: true, signature }
  }
  return state
}
