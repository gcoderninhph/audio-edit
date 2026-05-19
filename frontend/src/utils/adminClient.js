import { apiFetch } from './runtimeConfig';
import { getAuthRequestHeaders } from './authClient';

async function parseJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || fallbackMessage);
  }
  return payload;
}

function buildAdminRequestOptions(options = {}) {
  return {
    ...options,
    headers: {
      ...getAuthRequestHeaders(),
      ...(options.headers || {}),
    },
  };
}

export async function completeTemporaryAdminSetup({ username, password, displayName }) {
  return parseJsonResponse(await apiFetch('/api/admin/bootstrap/complete', buildAdminRequestOptions({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, displayName }),
  })), 'Unable to complete admin setup.');
}

export async function fetchAdminOverview() {
  return parseJsonResponse(
    await apiFetch('/api/admin/overview', buildAdminRequestOptions()),
    'Unable to load admin overview.',
  );
}

export async function fetchAdminUsers() {
  return parseJsonResponse(
    await apiFetch('/api/admin/users?limit=200', buildAdminRequestOptions()),
    'Unable to load admin users.',
  );
}

export async function updateAdminUser(userId, updates) {
  return parseJsonResponse(await apiFetch(`/api/admin/users/${userId}`, buildAdminRequestOptions({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })), 'Unable to update the selected user.');
}

export async function fetchAdminRequests() {
  return parseJsonResponse(
    await apiFetch('/api/admin/requests?limit=50', buildAdminRequestOptions()),
    'Unable to load recent requests.',
  );
}
