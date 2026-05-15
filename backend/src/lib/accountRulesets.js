const { getAvailableRulesets, getRulesetDefinitionById } = require('../../rulesets');

const ACCOUNT_RULESET_OPTIONS = Object.freeze(
  getAvailableRulesets().map((definition, index) => Object.freeze({
    index,
    id: definition.id,
    label: definition.label,
    abbreviation: definition.abbreviation
  }))
);

const MAX_FAVOURITE_RULESETS = 5;
const MAX_RULESET_LOADOUT = 3;
const DEFAULT_RULESET_REF_PREFIX = 'default:';
const SAVED_RULESET_REF_PREFIX = 'saved:';

function isValidRulesetIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < ACCOUNT_RULESET_OPTIONS.length;
}

function buildDefaultRulesetRef(index) {
  return `${DEFAULT_RULESET_REF_PREFIX}${Number(index)}`;
}

function buildSavedRulesetRef(rulesetId) {
  return `${SAVED_RULESET_REF_PREFIX}${String(rulesetId || '').trim()}`;
}

function parseRulesetReference(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) {
    const index = Number(value);
    return isValidRulesetIndex(index)
      ? {
        kind: 'default',
        index,
        ref: buildDefaultRulesetRef(index)
      }
      : null;
  }

  const normalizedValue = String(value || '').trim();
  if (normalizedValue.startsWith(DEFAULT_RULESET_REF_PREFIX)) {
    const index = Number(normalizedValue.slice(DEFAULT_RULESET_REF_PREFIX.length));
    return isValidRulesetIndex(index)
      ? {
        kind: 'default',
        index,
        ref: buildDefaultRulesetRef(index)
      }
      : null;
  }

  if (normalizedValue.startsWith(SAVED_RULESET_REF_PREFIX)) {
    const rulesetId = normalizedValue.slice(SAVED_RULESET_REF_PREFIX.length).trim();
    return /^[a-f\d]{24}$/i.test(rulesetId)
      ? {
        kind: 'saved',
        rulesetId,
        ref: buildSavedRulesetRef(rulesetId)
      }
      : null;
  }

  return null;
}

function normalizeRulesetIndexes(value, { maxItems, fieldName }) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of ruleset references`);
  }

  const normalizedRefs = [];
  const seen = new Set();

  value.forEach((entry) => {
    const parsedReference = parseRulesetReference(entry);
    if (!parsedReference) {
      throw new Error(`${fieldName} contains an invalid ruleset reference`);
    }

    if (seen.has(parsedReference.ref)) {
      return;
    }

    seen.add(parsedReference.ref);
    normalizedRefs.push(parsedReference.ref);
  });

  if (normalizedRefs.length > maxItems) {
    throw new Error(`${fieldName} can contain at most ${maxItems} rulesets`);
  }

  return normalizedRefs;
}

function getRulesetDefinitionByIndex(index) {
  const option = ACCOUNT_RULESET_OPTIONS[index];
  if (!option) {
    return null;
  }

  return getRulesetDefinitionById(option.id);
}

function createSelectedRulesetsFromLoadout(loadoutIndexes = []) {
  const normalizedLoadout = normalizeRulesetIndexes(loadoutIndexes, {
    maxItems: MAX_RULESET_LOADOUT,
    fieldName: 'rulesetLoadout'
  });

  if (normalizedLoadout.length === 0) {
    return null;
  }

  return ACCOUNT_RULESET_OPTIONS.reduce((acc, option) => {
    acc[option.id] = normalizedLoadout.includes(buildDefaultRulesetRef(option.index));
    return acc;
  }, {});
}

module.exports = {
  ACCOUNT_RULESET_OPTIONS,
  DEFAULT_RULESET_REF_PREFIX,
  MAX_FAVOURITE_RULESETS,
  MAX_RULESET_LOADOUT,
  SAVED_RULESET_REF_PREFIX,
  buildDefaultRulesetRef,
  buildSavedRulesetRef,
  createSelectedRulesetsFromLoadout,
  getRulesetDefinitionByIndex,
  isValidRulesetIndex,
  parseRulesetReference,
  normalizeRulesetIndexes
};
