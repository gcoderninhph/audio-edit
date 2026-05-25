import { useEffect, useMemo, useState } from 'react'
import { estimateVoiceoverCredits } from '../../utils/voiceoverUtils'

const INITIAL_ESTIMATE = Object.freeze({ creditCost: null, error: '', estimate: null, isLoading: false, languageCode: '', signature: '' })

function buildSubtitleSignature(subtitles) {
  if (!Array.isArray(subtitles) || !subtitles.length) return ''
  return JSON.stringify(subtitles.map((subtitle) => ({
    end: Number(subtitle.end || 0),
    id: subtitle.id || '',
    start: Number(subtitle.start || 0),
    text: String(subtitle.text || '').trim(),
  })).filter((subtitle) => subtitle.text))
}

export function useVoiceoverCreditEstimate({ enabled, languageCode, subtitles }) {
  const subtitleSignature = useMemo(() => buildSubtitleSignature(subtitles), [subtitles])
  const [state, setState] = useState(INITIAL_ESTIMATE)
  const shouldEstimate = Boolean(enabled && languageCode && subtitleSignature)

  useEffect(() => {
    if (!shouldEstimate) {
      return undefined
    }

    let isDisposed = false
    const controller = typeof AbortController === 'undefined' ? null : new AbortController()

    const timeoutId = window.setTimeout(async () => {
      try {
        setState((current) => ({ ...current, error: '', isLoading: true, languageCode, signature: subtitleSignature }))
        const estimate = await estimateVoiceoverCredits(subtitles, {
          languageCode,
          signal: controller?.signal,
        })
        if (isDisposed) return
        const creditCost = Number(estimate?.creditCost)
        setState({
          creditCost: Number.isFinite(creditCost) ? Math.max(0, Math.ceil(creditCost)) : null,
          error: '',
          estimate,
          isLoading: false,
          languageCode,
          signature: subtitleSignature,
        })
      } catch (error) {
        if (isDisposed || error?.name === 'AbortError') return
        setState({ creditCost: null, error: error?.message || 'Unable to estimate voiceover credits', estimate: null, isLoading: false, languageCode, signature: subtitleSignature })
      }
    }, 350)

    return () => {
      isDisposed = true
      window.clearTimeout(timeoutId)
      controller?.abort()
    }
  }, [languageCode, shouldEstimate, subtitleSignature, subtitles])

  if (!shouldEstimate) return INITIAL_ESTIMATE
  if (state.signature !== subtitleSignature || state.languageCode !== languageCode) {
    return { ...INITIAL_ESTIMATE, isLoading: true, languageCode, signature: subtitleSignature }
  }
  return state
}