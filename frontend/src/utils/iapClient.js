import { getAuthRequestHeaders } from './authClient';
import { apiFetch, buildServerUrl } from './runtimeConfig';

const CREDIT_PACK_TYPES = new Set(['addCredit']);
const PREMIUM_PACK_TYPES = new Set(['premiumSubscribe', 'creditsAndPremiumPack']);

function normalizeCurrency(value) {
  return String(value || 'USD').trim().toUpperCase() || 'USD';
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizePublicPackage(record = {}) {
  return {
    credits: Math.max(0, Number(record.credits) || 0),
    currency: normalizeCurrency(record.currency),
    description: String(record.description || '').trim(),
    id: String(record.id || ''),
    isRecommended: normalizeBoolean(record.isRecommended),
    name: String(record.name || '').trim() || 'Premium plan',
    packType: String(record.packType || 'addCredit').trim(),
    price: Number(record.price) || 0,
  };
}

async function fetchPublicPackages() {
  const response = await apiFetch('/api/iap/packages', { method: 'GET' });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load premium plans.');
  }

  return (payload?.packages || []).map(normalizePublicPackage);
}

function sortPublicPackages(packages) {
  return packages
    .sort(
      (left, right) =>
        Number(Boolean(right.isRecommended)) - Number(Boolean(left.isRecommended)) ||
        left.price - right.price ||
        left.name.localeCompare(right.name),
    );
}

function filterPackagesByType(packages, packTypes) {
  return sortPublicPackages(packages.filter((record) => packTypes.has(record.packType)));
}

export async function fetchPublicPremiumPackages() {
  return filterPackagesByType(await fetchPublicPackages(), PREMIUM_PACK_TYPES);
}

export async function fetchPublicCreditPackages() {
  return filterPackagesByType(await fetchPublicPackages(), CREDIT_PACK_TYPES);
}

async function parsePaymentResponse(response, fallbackMessage) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || fallbackMessage);
  }

  return payload || {};
}

export async function createIapPayment(packageId) {
  return parsePaymentResponse(await apiFetch('/api/iap/payments', {
    body: JSON.stringify({ packageId }),
    headers: {
      'Content-Type': 'application/json',
      ...getAuthRequestHeaders(),
    },
    method: 'POST',
  }), 'Unable to create payment ticket.');
}

export async function fetchIapPayment(paymentId) {
  return parsePaymentResponse(await apiFetch(`/api/iap/payments/${encodeURIComponent(paymentId)}`, {
    headers: getAuthRequestHeaders(),
    method: 'GET',
  }), 'Unable to check payment status.');
}

export function buildIapPaymentQrUrl(paymentId) {
  if (!paymentId) {
    return '';
  }
  return buildServerUrl(`/api/iap/payments/${encodeURIComponent(paymentId)}/qr`);
}

export async function fetchIapPaymentQrBlob(paymentId) {
  const response = await apiFetch(`/api/iap/payments/${encodeURIComponent(paymentId)}/qr`, {
    headers: getAuthRequestHeaders(),
    method: 'GET',
  });

  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new Error(payload?.error || 'Unable to load QR image.');
  }

  return response.blob();
}