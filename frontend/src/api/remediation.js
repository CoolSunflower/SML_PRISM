const API_BASE = '/api';

/**
 * Remediates a processed item by accepting or rejecting it.
 * @param {string} source - 'kwatch' or 'google-alerts'
 * @param {string} id - document id
 * @param {'accepted'|'rejected'} action
 * @param {string} [platform] - required for kwatch (partition key)
 * @param {{sentiment?: string, topic?: string, subTopic?: string}} [editedFields] - optional fields to update (only for 'accepted')
 * @returns {Promise<{item: object}>}
 */
export async function remediateItem(source, id, action, platform, editedFields = {}) {
  const url =
    source === 'kwatch'
      ? `${API_BASE}/kwatch/processed/${encodeURIComponent(id)}/remediate`
      : `${API_BASE}/google-alerts/processed/${encodeURIComponent(id)}/remediate`;

  const body = {
    action,
    ...(source === 'kwatch' && { platform }),
    ...(action === 'accepted' && editedFields),
  };
  console.log(`[Remediation] Sending ${action} for ${source} item ${id}`, body);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
