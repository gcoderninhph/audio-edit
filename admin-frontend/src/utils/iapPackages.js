export const IAP_PACK_TYPE_OPTIONS = [
  { value: 'addCredit', label: 'Add credit' },
  { value: 'premiumSubscribe', label: 'Premium subscribe' },
  { value: 'creditsAndPremiumPack', label: 'Credits & premium pack' },
]

export const DEFAULT_IAP_PACK_TYPE = IAP_PACK_TYPE_OPTIONS[0].value

export const IAP_PACK_TYPE_LABELS = Object.fromEntries(
  IAP_PACK_TYPE_OPTIONS.map((option) => [option.value, option.label]),
)

export function normalizeIapPackType(value) {
  return IAP_PACK_TYPE_LABELS[value] ? value : DEFAULT_IAP_PACK_TYPE
}

export function getIapPackTypeLabel(value) {
  return IAP_PACK_TYPE_LABELS[normalizeIapPackType(value)]
}

export function getPackFunctionBehavior(packType) {
  switch (normalizeIapPackType(packType)) {
    case 'premiumSubscribe':
      return { functionType: 'unlockPremium', usesCredits: false, usesPremium: true }
    case 'creditsAndPremiumPack':
      return { functionType: 'creditsAndPremium', usesCredits: true, usesPremium: true }
    case 'addCredit':
    default:
      return { functionType: 'addCredits', usesCredits: true, usesPremium: false }
  }
}

export function buildPackFunctionPayload(packType, formState) {
  const behavior = getPackFunctionBehavior(packType)
  return {
    credits: behavior.usesCredits ? Number(formState.credits || 0) : 0,
    functionType: behavior.functionType,
    premiumMode: behavior.usesPremium ? formState.premiumMode || 'lifetime' : 'none',
  }
}

export function formatPackFunctionSummary(packType, functionRecord) {
  const behavior = getPackFunctionBehavior(packType)
  const summaryParts = []
  if (behavior.usesCredits && Number(functionRecord?.credits || 0) > 0) {
    summaryParts.push(`${Number(functionRecord.credits)} credits`)
  }
  if (behavior.usesPremium && functionRecord?.premiumMode && functionRecord.premiumMode !== 'none') {
    summaryParts.push(functionRecord.premiumMode === 'lifetime' ? 'Premium lifetime' : functionRecord.premiumMode)
  }
  return summaryParts.join(' + ') || '-'
}