function getPackTypeLabel(packType) {
  if (packType === 'creditsAndPremiumPack') {
    return 'Credits + premium';
  }
  if (packType === 'premiumSubscribe') {
    return 'Premium';
  }
  return 'Credits';
}

export function formatPrice(value, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      currency: currency || 'VND',
      maximumFractionDigits: 0,
      style: 'currency',
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0)} ${currency || 'VND'}`;
  }
}

function parseDescriptionFeatures(description) {
  const normalizedDescription = String(description || '').trim();
  if (!normalizedDescription) {
    return [];
  }

  const descriptionLines = normalizedDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return descriptionLines.flatMap((line) => {
    if (line.startsWith('- ')) {
      return line
        .split(/\s+-\s+/)
        .map((segment) => segment.replace(/^-\s*/, '').trim())
        .filter(Boolean);
    }

    if (line.includes(' - ')) {
      return line.split(/\s+-\s+/).map((segment) => segment.trim()).filter(Boolean);
    }

    return [line];
  });
}

export function buildPackageBenefits(packageRecord) {
  const benefits = [];
  if (!packageRecord) {
    return benefits;
  }
  if (Number(packageRecord.credits) > 0) {
    benefits.push(`${Number(packageRecord.credits)} credits included`);
  }
  if (packageRecord.packType === 'premiumSubscribe' || packageRecord.packType === 'creditsAndPremiumPack') {
    benefits.push('Premium access included');
  }

  benefits.push(...parseDescriptionFeatures(packageRecord.description));

  return benefits.filter(Boolean).slice(0, 4);
}

export function buildReviewRows(packageRecord, paymentLabel) {
  return [
    ['Package', packageRecord?.name || '-'],
    ['Pack type', getPackTypeLabel(packageRecord?.packType)],
    ['Amount', paymentLabel],
    ['Currency', packageRecord?.currency || 'VND'],
    ['Ticket duration', '3 minutes'],
  ];
}

export function buildPendingRows(payment, remainingSeconds, formatCountdown) {
  if (!payment) {
    return [];
  }

  return [
    ['Status', 'Waiting for payment confirmation'],
    ['Amount', formatPrice(payment.amount, payment.currency)],
    ['Transfer content', payment.transactionCode],
    ['Receiver name', payment.beneficiaryName || '-'],
    ['Bank id', payment.bankId || '-'],
    ['Bank account', payment.bankAccount || '-'],
    ['Time left', formatCountdown(remainingSeconds)],
  ];
}

export function getPaymentPackTypeLabel(packType) {
  return getPackTypeLabel(packType);
}