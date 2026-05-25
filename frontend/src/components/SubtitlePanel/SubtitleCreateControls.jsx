import { getSubtitleCreateLanguageSelection } from '../../utils/subtitleTracks'

export default function SubtitleCreateControls({
  activeSubtitleLanguage,
  authRequiredLabel,
  createSubCreditEstimate,
  hasOriginalSubtitles,
  isAuthenticated,
  onCreateSub,
  onLanguageChange,
  subtitleLanguageOptions,
  t,
}) {
  const {
    availableOptions,
    canCreateSelectedLanguage,
    selectedLanguageKey,
  } = getSubtitleCreateLanguageSelection(subtitleLanguageOptions, activeSubtitleLanguage, hasOriginalSubtitles)

  if (!availableOptions.length) {
    return null
  }

  const createSubCreditCost = Number.isFinite(Number(createSubCreditEstimate?.creditCost))
    ? Number(createSubCreditEstimate.creditCost)
    : null
  const estimateLabel = createSubCreditEstimate?.isLoading ? '...' : createSubCreditCost === null ? '...' : createSubCreditCost
  const buttonLabel = !isAuthenticated
    ? authRequiredLabel
    : t('panel.subtitleList.createSubWithCredits', { credits: estimateLabel })
  const isPartialEstimate = Boolean(createSubCreditEstimate?.estimate?.pendingTranslationCredit)
  const partialDetectCost = Number(createSubCreditEstimate?.estimate?.transcription?.creditCost)

  const handleCreateSub = () => {
    onCreateSub?.(selectedLanguageKey)
  }

  return (
    <>
      <div className="subtitle-language-row">
        <label className="subtitle-tools-label" htmlFor="subtitle-language-select">{t('panel.subtitleList.displayLanguage')}</label>
        <div className="subtitle-input-button-group">
          <select
            id="subtitle-language-select"
            value={selectedLanguageKey}
            onChange={(event) => onLanguageChange?.(event.target.value)}
            className="subtitle-lang-select subtitle-input-button-group-input"
          >
            {availableOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}{option.translatable && !option.hasSubtitles ? ` ${t('panel.subtitleList.notTranslatedSuffix')}` : ''}
              </option>
            ))}
          </select>

          <button
            className="btn btn-primary btn-sm subtitle-input-button-group-action"
            style={{ background: '#3b82f6' }}
            disabled={!canCreateSelectedLanguage}
            onClick={handleCreateSub}
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      {isAuthenticated && createSubCreditEstimate?.error && (
        <div className="subtitle-tool-note subtitle-tool-warning">
          {createSubCreditEstimate.error}
        </div>
      )}

      {isAuthenticated && isPartialEstimate && Number.isFinite(partialDetectCost) && (
        <div className="subtitle-tool-note">
          {t('panel.subtitleList.createSubPartialCreditHint', { credits: partialDetectCost })}
        </div>
      )}

      {hasOriginalSubtitles && (
        <div className="subtitle-tool-note">
          {t('panel.subtitleList.originSubtitlesCached')}
        </div>
      )}
    </>
  )
}
