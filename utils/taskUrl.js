'use strict';

function normalizeTaskUrl(value, { allowEmpty = true } = {}) {
  const text = String(value == null ? '' : value).trim();
  if (!text && allowEmpty) return '';
  if (!text || text.length > 2048) return null;
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

module.exports = { normalizeTaskUrl };
