const { normalizeText, parseJsonOutput, uniqueTextValues } = require('../shared/json-utils');

const FORBIDDEN_PHRASES = [
  'i need to',
  'we need to',
  "let's analyze",
  'chain of thought',
  'thinking step by step',
  'my thinking',
  'thought process',
  'internal reasoning',
  'stack trace'
];

const TOXIC_PHRASES = [
  'idiot',
  'stupid',
  'terrible',
  'awful',
  'dumb'
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

function parseOutput(output) {
  const parsed = parseJsonOutput(output);
  if (!parsed.ok) {
    return { error: parsed.error, value: null };
  }

  return { error: '', value: parsed.value };
}

function primaryTextCandidates(payload = {}) {
  return [
    payload.comment,
    payload.moveComment,
    payload.feedback,
    payload.moveFeedback,
    payload.review,
    payload.summary,
    payload.finalReview,
    payload.message,
    payload.text
  ];
}

function extractPrimaryText(payload = {}) {
  return normalizeText(primaryTextCandidates(payload).find((value) => normalizeText(value)) || '');
}

function hasMeaningfulFinalReview(payload = {}) {
  return Boolean(extractPrimaryText(payload));
}

function normalizeExpectedCardVariants(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return [];
  }

  const faceRankNames = {
    a: 'ace',
    k: 'king',
    q: 'queen',
    j: 'jack'
  };
  const numberRankNames = {
    '2': 'two',
    '3': 'three',
    '4': 'four',
    '5': 'five',
    '6': 'six',
    '7': 'seven',
    '8': 'eight',
    '9': 'nine',
    '10': 'ten'
  };
  const suitNames = {
    h: { word: 'hearts', symbol: '♥' },
    d: { word: 'diamonds', symbol: '♦' },
    c: { word: 'clubs', symbol: '♣' },
    s: { word: 'spades', symbol: '♠' }
  };
  const match = normalized.match(/^(10|[2-9]|[ajkq]|ace|king|queen|jack|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:of[\s-]*)?(hearts?|diamonds?|clubs?|spades?|[hdcs]|[♥♦♣♠])$/i);
  if (!match) {
    return [normalized];
  }

  const rankToken = match[1].toLowerCase();
  const suitToken = match[2].toLowerCase();
  const rankShort = ({ ace: 'a', king: 'k', queen: 'q', jack: 'j', ...Object.fromEntries(Object.entries(numberRankNames).map(([key, word]) => [word, key])) })[rankToken] || rankToken;
  const rankWord = faceRankNames[rankShort] || numberRankNames[rankShort] || rankShort;
  const suitShort = ({ hearts: 'h', heart: 'h', diamonds: 'd', diamond: 'd', clubs: 'c', club: 'c', spades: 's', spade: 's', '♥': 'h', '♦': 'd', '♣': 'c', '♠': 's' })[suitToken] || suitToken;
  const suit = suitNames[suitShort];
  if (!suit) {
    return [normalized];
  }

  return [
    `${rankShort}-${suit.word}`,
    `${rankShort} ${suit.word}`,
    `${rankShort} of ${suit.word}`,
    `${rankWord} of ${suit.word}`,
    `${rankShort}${suit.symbol}`,
    `${rankShort}-${suitShort}`,
    `${rankShort}${suitShort}`
  ];
}

module.exports.isValidJsonOutput = (output) => {
  const parsed = parseJsonOutput(output);
  return parsed.ok ? pass() : fail(`Expected valid JSON output, received parse error: ${parsed.error}`);
};

module.exports.trainerModeContract = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const expectedMode = normalizeText(context?.vars?.mode);
  if (normalizeText(parsed.value?.mode) !== expectedMode) {
    return fail(`Expected trainer mode '${expectedMode}' but received '${parsed.value?.mode || ''}'.`);
  }

  if (expectedMode === 'before_move') {
    return extractPrimaryText(parsed.value)
      ? pass()
      : fail('Expected a non-empty Trainer pre-move comment.');
  }

  if (expectedMode === 'after_move') {
    if (typeof parsed.value?.shouldComment !== 'boolean') {
      return fail('Expected after-move output to include a boolean shouldComment field.');
    }

    if (parsed.value.shouldComment && !extractPrimaryText(parsed.value)) {
      return fail('Expected non-empty feedback when shouldComment is true.');
    }

    return pass();
  }

  if (expectedMode === 'final_review') {
    return hasMeaningfulFinalReview(parsed.value)
      ? pass()
      : fail('Expected a non-empty final training review.');
  }

  return fail(`Unknown Trainer mode '${expectedMode}'.`);
};

module.exports.trainerRatingInRange = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const mode = normalizeText(parsed.value?.mode);
  if (mode === 'after_move') {
    const rating = Number(parsed.value?.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
      return fail(`Expected move rating between 0 and 10, received '${parsed.value?.rating}'.`);
    }

    const min = Number(context?.vars?.expectedMinRating);
    const max = Number(context?.vars?.expectedMaxRating);
    if (Number.isFinite(min) && rating < min) {
      return fail(`Expected move rating >= ${min}, received ${rating}.`);
    }
    if (Number.isFinite(max) && rating > max) {
      return fail(`Expected move rating <= ${max}, received ${rating}.`);
    }

    return pass();
  }

  if (mode === 'final_review' && parsed.value?.starRating != null) {
    const rating = Number(parsed.value.starRating);
    return Number.isFinite(rating) && rating >= 0.5 && rating <= 5
      ? pass()
      : fail(`Expected starRating between 0.5 and 5, received '${parsed.value.starRating}'.`);
  }

  if (mode === 'final_review') {
    return fail('Expected final_review output to include a starRating between 0.5 and 5.');
  }

  return pass('Rating is not required for this trainer mode.');
};

module.exports.trainerDoesNotLeakHiddenCards = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const renderedText = extractPrimaryText(parsed.value).toLowerCase();
  const forbiddenValues = uniqueTextValues([
    parseMaybeJson(context?.vars?.forbiddenHiddenStrings, []),
    parseMaybeJson(context?.vars?.hiddenOpponentCards, [])
  ]);
  const leakedValue = forbiddenValues.find((value) => renderedText.includes(value.toLowerCase()));

  return leakedValue
    ? fail(`Trainer output leaked hidden card information: '${leakedValue}'.`)
    : pass();
};

module.exports.outputDoesNotContainChainOfThought = (output) => {
  const normalized = normalizeText(output).toLowerCase();
  const matched = FORBIDDEN_PHRASES.find((phrase) => normalized.includes(phrase));
  return matched
    ? fail(`Trainer output should not contain forbidden reasoning phrase '${matched}'.`)
    : pass();
};

module.exports.trainerLengthScore = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const text = extractPrimaryText(parsed.value);
  const mode = normalizeText(parsed.value?.mode);
  const maxLength = Number(context?.vars?.maxLength || (
    mode === 'before_move'
      ? 220
      : mode === 'after_move'
        ? 260
        : 420
  ));

  if (text.length <= maxLength) {
    return softScore(1, `Trainer response stayed within ${maxLength} characters.`);
  }

  if (text.length <= maxLength + 50) {
    return softScore(0.4, `Trainer response slightly exceeded ${maxLength} characters (${text.length}).`);
  }

  return fail(`Trainer response exceeded ${maxLength} characters (${text.length}).`);
};

module.exports.trainerConstructiveToneScore = (output) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const text = extractPrimaryText(parsed.value).toLowerCase();
  const toxic = TOXIC_PHRASES.find((phrase) => text.includes(phrase));
  if (toxic) {
    return fail(`Trainer output used toxic phrasing '${toxic}'.`);
  }

  return softScore(
    /(good choice|reasonable move|next step|keep|focus|steadier|safer|strength)/i.test(text) ? 1 : 0.55,
    'Trainer tone stayed constructive.'
  );
};

module.exports.trainerRecommendationExpectation = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const text = extractPrimaryText(parsed.value);
  if (context?.vars?.expectShouldComment === false) {
    return parsed.value?.shouldComment === false || !text
      ? pass()
      : fail('Expected Trainer to stay quiet or return shouldComment=false for this case.');
  }

  if (context?.vars?.requireSuggestion) {
    const expectedAlternative = normalizeText(context?.vars?.suggestedAlternativeCard).toLowerCase();
    const expectedVariants = normalizeExpectedCardVariants(expectedAlternative);
    if (expectedAlternative && !expectedVariants.some((variant) => text.toLowerCase().includes(variant))) {
      return fail(`Expected Trainer feedback to mention concrete alternative '${expectedAlternative}'.`);
    }

    return /(would|could|instead|safer|next step|better)/i.test(text)
      ? pass()
      : fail('Expected Trainer feedback to include a constructive alternative or recommendation.');
  }

  return pass();
};

module.exports.trainerFinalReviewNoNumericScore = (output) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  if (normalizeText(parsed.value?.mode) !== 'final_review') {
    return pass();
  }

  const text = extractPrimaryText(parsed.value);
  return /\/\s*10\b|\bout of 10\b|\bstars?\b|\b\d(?:\.\d+)?\s*\/\s*5\b/i.test(text)
    ? fail('Final review should not mention the numeric move or star rating in its visible text.')
    : pass();
};

module.exports.trainerSourceExpectation = (output, context) => {
  const parsed = parseOutput(output);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const allowedSources = parseMaybeJson(context?.vars?.expectedAllowedSources, []);
  const normalizedAllowedSources = Array.isArray(allowedSources)
    ? allowedSources.map((value) => normalizeText(value)).filter(Boolean)
    : [];
  if (normalizedAllowedSources.length > 0) {
    return normalizedAllowedSources.includes(normalizeText(parsed.value?.source))
      ? pass()
      : fail(`Expected Trainer source in [${normalizedAllowedSources.join(', ')}] but received '${parsed.value?.source || ''}'.`);
  }

  const expectedSource = normalizeText(context?.vars?.expectedSource);
  if (!expectedSource) {
    return pass();
  }

  return normalizeText(parsed.value?.source) === expectedSource
    ? pass()
    : fail(`Expected Trainer source '${expectedSource}' but received '${parsed.value?.source || ''}'.`);
};

module.exports.trainerLatencyScore = (_output, context) => {
  const elapsedMs = Number(context?.providerResponse?.metadata?.elapsedMs || 0);
  const maxElapsedMs = Number(context?.vars?.maxElapsedMs || 0);

  if (!maxElapsedMs || !Number.isFinite(elapsedMs)) {
    return pass('No trainer latency budget configured for this case.');
  }

  if (elapsedMs <= maxElapsedMs) {
    return softScore(1, `Trainer latency ${elapsedMs}ms stayed within ${maxElapsedMs}ms.`);
  }

  if (elapsedMs <= maxElapsedMs * 1.5) {
    return softScore(0.35, `Trainer latency ${elapsedMs}ms exceeded ${maxElapsedMs}ms but remained within a soft margin.`);
  }

  return fail(`Trainer latency ${elapsedMs}ms exceeded the allowed ${maxElapsedMs}ms budget.`);
};
