function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return '';
  }

  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    return raw;
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  return arrayMatch ? arrayMatch[0] : '';
}

function parseJsonOutput(output) {
  const extracted = extractJsonObject(output);
  if (!extracted) {
    return {
      ok: false,
      error: 'no-json-object-found',
      value: null
    };
  }

  try {
    return {
      ok: true,
      error: '',
      value: JSON.parse(extracted)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      value: null
    };
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clampNumber(value, min, max, fallback = min) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numericValue));
}

function uniqueTextValues(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .flat()
      .map((value) => normalizeText(value))
      .filter(Boolean)
  )];
}

module.exports = {
  clampNumber,
  extractJsonObject,
  normalizeText,
  parseJsonOutput,
  uniqueTextValues
};
