const { normalizeText, parseJsonOutput } = require('../shared/json-utils');

const FORBIDDEN_PHRASES = [
  'i need to',
  'we need to',
  "let's analyze",
  'thinking',
  'chain of thought',
  'score maybe',
  'stack trace'
];

function pass(reason = 'Assertion passed', score = 1) {
  return { pass: true, score, reason };
}

function fail(reason) {
  return { pass: false, score: 0, reason };
}

function softScore(score, reason) {
  return { pass: score > 0, score, reason };
}

function parseMaybeJson(value, fallback = value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value;
  }

  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function normalizeList(value) {
  const parsed = parseMaybeJson(value, value);
  if (Array.isArray(parsed)) {
    return parsed.map((entry) => normalizeText(entry)).filter(Boolean);
  }

  const normalized = normalizeText(parsed);
  return normalized ? [normalized] : [];
}

function getLegalMoves(context) {
  return (parseMaybeJson(context?.vars?.legalMoves, []) || []).map((move) => (
    typeof move === 'string'
      ? { id: move, card: move }
      : { id: move.id, card: move.card || move.id }
  ));
}

function parseOutput(output) {
  const parsed = parseJsonOutput(output);
  if (!parsed.ok) {
    return { error: parsed.error, value: null };
  }

  return { error: '', value: parsed.value };
}

module.exports.isValidJsonOutput = (output) => {
  const parsed = parseJsonOutput(output);
  return parsed.ok ? pass() : fail(`Expected valid JSON output, received parse error: ${parsed.error}`);
};

module.exports.moveIdExists = (output) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  return normalizeText(parsed.value?.moveId)
    ? pass()
    : fail('Expected a non-empty moveId in gameplay output.');
};

module.exports.gameplayMoveIsLegal = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const legalMoveIds = getLegalMoves(context).map((move) => move.id);
  return legalMoveIds.includes(parsed.value.moveId)
    ? pass()
    : fail(`Expected moveId '${parsed.value.moveId}' to be one of: ${legalMoveIds.join(', ')}`);
};

module.exports.gameplayDoesNotInventCard = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const legalCards = getLegalMoves(context).map((move) => move.card || move.id);
  const selectedCard = normalizeText(parsed.value?.card || parsed.value?.moveId);

  return !selectedCard || legalCards.includes(selectedCard)
    ? pass()
    : fail(`Expected selected card '${selectedCard}' to stay inside legal cards: ${legalCards.join(', ')}`);
};

module.exports.gameplayConfidenceInRange = (output) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  if (parsed.value?.confidence == null) {
    return pass('Confidence was omitted, which is allowed.');
  }

  const numericConfidence = Number(parsed.value.confidence);
  return Number.isFinite(numericConfidence) && numericConfidence >= 0 && numericConfidence <= 1
    ? pass()
    : fail(`Expected confidence to be between 0 and 1, received '${parsed.value.confidence}'.`);
};

module.exports.outputDoesNotContainChainOfThought = (output) => {
  const normalized = normalizeText(output).toLowerCase();
  const matched = FORBIDDEN_PHRASES.find((phrase) => normalized.includes(phrase));
  return matched
    ? fail(`Output should not contain forbidden reasoning phrase '${matched}'.`)
    : pass();
};

module.exports.gameplayDifficultyExpectation = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const expectedMoveId = normalizeText(context?.vars?.expectedMoveId);
  if (expectedMoveId && parsed.value.moveId !== expectedMoveId) {
    return fail(`Expected moveId '${expectedMoveId}' but received '${parsed.value.moveId}'.`);
  }

  const acceptedMoveIds = normalizeList(context?.vars?.acceptedMoveIds);
  if (acceptedMoveIds.length > 0 && !acceptedMoveIds.includes(normalizeText(parsed.value.moveId))) {
    return fail(`Expected moveId in [${acceptedMoveIds.join(', ')}] but received '${parsed.value.moveId}'.`);
  }

  const forbiddenMoveIds = normalizeList(context?.vars?.forbiddenMoveIds);
  if (forbiddenMoveIds.includes(normalizeText(parsed.value.moveId))) {
    return fail(`MoveId '${parsed.value.moveId}' is explicitly forbidden for this scenario.`);
  }

  const expectedBotRank = normalizeText(context?.vars?.expectedBotRank);
  if (expectedBotRank && normalizeText(parsed.value.botRank) !== expectedBotRank) {
    return fail(`Expected botRank '${expectedBotRank}' but received '${parsed.value.botRank}'.`);
  }

  return pass();
};

module.exports.gameplayReasonScore = (output) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const reason = normalizeText(parsed.value?.reason);
  if (!reason) {
    return pass('Reason was omitted, which is allowed.');
  }

  return softScore(
    reason.length <= 160 ? 1 : 0.45,
    reason.length <= 160
      ? 'Reason stayed concise.'
      : `Reason was longer than the preferred 160 characters (${reason.length}).`
  );
};

module.exports.gameplayLatencyScore = (_output, context) => {
  const elapsedMs = Number(context?.providerResponse?.metadata?.elapsedMs || 0);
  const maxElapsedMs = Number(context?.vars?.maxElapsedMs || 0);

  if (!maxElapsedMs || !Number.isFinite(elapsedMs)) {
    return pass('No latency budget was configured for this case.');
  }

  if (elapsedMs <= maxElapsedMs) {
    return softScore(1, `Latency ${elapsedMs}ms stayed within ${maxElapsedMs}ms.`);
  }

  if (elapsedMs <= maxElapsedMs * 2) {
    return softScore(0.4, `Latency ${elapsedMs}ms exceeded ${maxElapsedMs}ms but remained within 2x budget.`);
  }

  return fail(`Latency ${elapsedMs}ms exceeded the allowed ${maxElapsedMs}ms budget.`);
};

module.exports.gameplaySourceExpectation = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const allowedSources = normalizeList(context?.vars?.expectedAllowedSources);
  if (allowedSources.length > 0) {
    return allowedSources.includes(normalizeText(parsed.value?.source))
      ? pass()
      : fail(`Expected source in [${allowedSources.join(', ')}] but received '${parsed.value?.source || ''}'.`);
  }

  const expectedSource = normalizeText(context?.vars?.expectedSource);
  if (!expectedSource) {
    return pass();
  }

  return normalizeText(parsed.value?.source) === expectedSource
    ? pass()
    : fail(`Expected source '${expectedSource}' but received '${parsed.value?.source || ''}'.`);
};
