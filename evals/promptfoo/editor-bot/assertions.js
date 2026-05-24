const { normalizeText, parseJsonOutput } = require('../shared/json-utils');

const ALLOWED_CATEGORY_KEYS = [
  'comebackPotential',
  'playerAgency',
  'claritySimplicity',
  'scoringBalance'
];

const REMOVED_CATEGORY_KEYS = [
  'fairness',
  'strategicDepth',
  'riskRewardBalance',
  'interactionQuality',
  'robustness',
  'exploitResistance'
];

const FORBIDDEN_PATTERNS = [
  /\bi need to\b/i,
  /\bwe need to\b/i,
  /\blet's analyze\b/i,
  /\bchain of thought\b/i,
  /\bscore maybe\b/i,
  /\bclarity\/simplicity:\b/i,
  /\bplayeragency:\b/i,
  /\bscoringbalance:\b/i,
  /\bcomebackpotential:\b/i,
  /\bstack trace\b/i,
  /\bjson parse\b/i,
  /\bthinking about\b/i,
  /^thinking\b/i
];

const seenNarratives = new Map();

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

function asLowercaseTerms(value) {
  return (parseMaybeJson(value, []) || []).map((term) => String(term).toLowerCase());
}

function parseOutputSummary(output) {
  const parsed = parseJsonOutput(output);
  if (!parsed.ok) {
    return { error: parsed.error, value: null };
  }

  return { error: '', value: parsed.value };
}

function getEnvelope(output, context = {}) {
  const fromMetadata = context?.providerResponse?.metadata?.fullResult;
  if (fromMetadata && typeof fromMetadata === 'object') {
    return { error: '', value: fromMetadata };
  }

  const parsed = parseOutputSummary(output);
  if (parsed.error) {
    return parsed;
  }

  return { error: '', value: parsed.value };
}

function getJudgment(output, context = {}) {
  const envelope = getEnvelope(output, context);
  if (envelope.error) {
    return envelope;
  }

  const value = envelope.value?.judgment || envelope.value;
  return { error: '', value };
}

function getUserFacingText(judgment = {}) {
  return [
    judgment.rulesetSummary,
    judgment.constructiveReview,
    ...(judgment.recommendations || []),
    ...(judgment.warnings || []),
    ...ALLOWED_CATEGORY_KEYS.map((key) => judgment.categories?.[key]?.explanation)
  ].map((entry) => normalizeText(entry)).filter(Boolean).join('\n');
}

function getAllowedSources(context = {}) {
  const expected = parseMaybeJson(context?.vars?.expectedAllowedReviewSources, []);
  if (Array.isArray(expected) && expected.length > 0) {
    return expected.map((entry) => String(entry).trim()).filter(Boolean);
  }

  const legacy = normalizeText(context?.vars?.expectedReviewSource);
  return legacy ? [legacy] : [];
}

module.exports.isValidJsonOutput = (output) => {
  const parsed = parseJsonOutput(output);
  return parsed.ok ? pass() : fail(`Expected valid JSON output, received parse error: ${parsed.error}`);
};

module.exports.providerEnvelopeIsValid = (output, context) => {
  const parsedSummary = parseOutputSummary(output);
  if (parsedSummary.error) {
    return fail(parsedSummary.error);
  }

  const envelope = getEnvelope(output, context);
  if (envelope.error) {
    return fail(envelope.error);
  }

  const value = envelope.value || {};
  if (!normalizeText(value.caseId)) {
    return fail('Provider envelope is missing caseId.');
  }
  if (!normalizeText(value.ruleset?.title) || !normalizeText(value.ruleset?.shortName)) {
    return fail('Provider envelope is missing ruleset title/shortName.');
  }
  if (!normalizeText(value.ruleset?.sourceHash) || Number(value.ruleset?.sourceLength) <= 0) {
    return fail('Provider envelope is missing a non-empty sourceHash/sourceLength.');
  }
  if (!normalizeText(value.providerMode) || !normalizeText(value.executionMode)) {
    return fail('Provider envelope is missing providerMode or executionMode.');
  }

  return pass();
};

module.exports.responseIsNotThinkingOnly = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const judgment = parsed.value || {};
  const combinedText = getUserFacingText(judgment);
  if (!combinedText) {
    return fail('Expected non-empty user-facing text in editor judgment.');
  }

  if (/\bthinking\b/i.test(combinedText) && !Array.isArray(judgment.warnings)) {
    return fail('Editor output appears to be thinking-only instead of a final user-facing result.');
  }

  return pass();
};

module.exports.resultSourceMatchesExpectations = (output, context) => {
  const envelope = getEnvelope(output, context);
  if (envelope.error) {
    return fail(envelope.error);
  }

  const value = envelope.value || {};
  const allowedSources = getAllowedSources(context);
  if (allowedSources.length > 0 && !allowedSources.includes(value.reviewSource)) {
    return fail(`Expected reviewSource in [${allowedSources.join(', ')}] but received '${value.reviewSource}'.`);
  }

  const expectedUsedFallback = context?.vars?.expectedUsedFallback;
  if (typeof expectedUsedFallback === 'boolean' && value.usedFallback !== expectedUsedFallback) {
    return fail(`Expected usedFallback=${expectedUsedFallback} but received ${value.usedFallback}.`);
  }

  const expectedSuccess = context?.vars?.expectedSuccess;
  if (typeof expectedSuccess === 'boolean' && value.success !== expectedSuccess) {
    return fail(`Expected success=${expectedSuccess} but received ${value.success}.`);
  }

  const expectedProviderModes = parseMaybeJson(context?.vars?.expectedProviderModes, []);
  if (Array.isArray(expectedProviderModes) && expectedProviderModes.length > 0 && !expectedProviderModes.includes(value.providerMode)) {
    return fail(`Expected providerMode in [${expectedProviderModes.join(', ')}] but received '${value.providerMode}'.`);
  }

  if (value.useRealCloud === true && value.executionMode === 'cloud' && value.cloudAttempted !== true) {
    return fail('Real-cloud case should have attempted the cloud path, but cloudAttempted was false.');
  }

  if (context?.vars?.requireCloudAttempt === true && value.cloudAttempted !== true) {
    return fail('Expected this case to attempt the real cloud path, but cloudAttempted was false.');
  }

  if (value.usedFallback === true && !normalizeText(value.fallbackReason) && value.reviewSource !== 'error') {
    return fail('Fallback results must expose a fallbackReason for debugging.');
  }

  return pass();
};

module.exports.sourceHashMatchesExpected = (output, context) => {
  const envelope = getEnvelope(output, context);
  if (envelope.error) {
    return fail(envelope.error);
  }

  const expectedHash = normalizeText(context?.vars?.expectedSourceHash);
  const actualHash = normalizeText(envelope.value?.ruleset?.sourceHash);
  if (!expectedHash) {
    return pass('No expected source hash configured.');
  }

  return actualHash === expectedHash
    ? pass()
    : fail(`Expected sourceHash '${expectedHash}' but received '${actualHash}'.`);
};

module.exports.hasRequiredEditorJudgeSchema = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const value = parsed.value || {};
  const hasSchema = Number.isFinite(Number(value.overallScore))
    && normalizeText(value.representativeEmoji)
    && value.categories
    && normalizeText(value.rulesetSummary)
    && normalizeText(value.constructiveReview)
    && Array.isArray(value.recommendations)
    && Array.isArray(value.warnings);

  return hasSchema
    ? pass()
    : fail('Expected overallScore, representativeEmoji, categories, rulesetSummary, constructiveReview, recommendations, and warnings.');
};

module.exports.hasOnlyAllowedEditorCategories = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const categoryKeys = Object.keys(parsed.value?.categories || {}).sort();
  const allowedKeys = [...ALLOWED_CATEGORY_KEYS].sort();
  const removedKey = REMOVED_CATEGORY_KEYS.find((key) => categoryKeys.includes(key));

  if (removedKey) {
    return fail(`Found removed legacy category '${removedKey}' in editor output.`);
  }

  return JSON.stringify(categoryKeys) === JSON.stringify(allowedKeys)
    ? pass()
    : fail(`Expected exactly these category keys: ${allowedKeys.join(', ')}. Received: ${categoryKeys.join(', ')}`);
};

module.exports.categoryScoresInRange = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const categories = parsed.value?.categories || {};
  for (const key of ALLOWED_CATEGORY_KEYS) {
    const score = Number(categories[key]?.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      return fail(`Category '${key}' must have a score between 0 and 10.`);
    }
  }

  const overallScore = Number(parsed.value?.overallScore);
  return Number.isFinite(overallScore) && overallScore >= 0 && overallScore <= 10
    ? pass()
    : fail(`overallScore must be between 0 and 10, received '${parsed.value?.overallScore}'.`);
};

module.exports.explanationsAreClean = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const categories = parsed.value?.categories || {};
  for (const key of ALLOWED_CATEGORY_KEYS) {
    const explanation = normalizeText(categories[key]?.explanation);
    if (!explanation) {
      return fail(`Category '${key}' needs a non-empty explanation.`);
    }

    if (new RegExp(`^${key}\\b`, 'i').test(explanation)) {
      return fail(`Category '${key}' explanation should not begin with the category key.`);
    }

    if (/\bscore\s*(?:maybe|:|is|\d)|\brating\s*(?::|is|\d)|\b\d(?:\.\d+)?\s*\/\s*10\b/i.test(explanation)) {
      return fail(`Category '${key}' explanation should not include score or rating text.`);
    }
  }

  return pass();
};

module.exports.representativeEmojiIsValid = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const emoji = normalizeText(parsed.value?.representativeEmoji);
  return /\p{Extended_Pictographic}/u.test(emoji)
    ? pass()
    : fail(`Expected representativeEmoji to contain an emoji, received '${emoji}'.`);
};

module.exports.editorKeywordsMatchCase = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const text = getUserFacingText(parsed.value).toLowerCase();
  const expectedKeywords = (parseMaybeJson(context?.vars?.expectedKeywords, []) || [])
    .map((entry) => String(entry).toLowerCase());
  const forbiddenKeywords = (parseMaybeJson(context?.vars?.forbiddenKeywords, []) || [])
    .map((entry) => String(entry).toLowerCase());

  if (expectedKeywords.length > 0 && !expectedKeywords.some((term) => text.includes(term))) {
    return fail(`Expected output to mention at least one of: ${expectedKeywords.join(', ')}.`);
  }

  const forbidden = forbiddenKeywords.find((term) => text.includes(term));
  if (forbidden) {
    return fail(`Output should not mention '${forbidden}' for this case.`);
  }

  return pass();
};

module.exports.editorNarrativeFieldsPresent = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const combinedText = `${normalizeText(parsed.value?.rulesetSummary)} ${normalizeText(parsed.value?.constructiveReview)}`.toLowerCase();
  const requiredText = (parseMaybeJson(context?.vars?.requiredText, []) || []).map((entry) => String(entry).toLowerCase());
  const missingTerm = requiredText.find((term) => !combinedText.includes(term));

  return missingTerm
    ? fail(`Expected summary/review to mention '${missingTerm}'.`)
    : pass();
};

module.exports.editorRecommendationsWarningsArrays = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  return Array.isArray(parsed.value?.recommendations) && Array.isArray(parsed.value?.warnings)
    ? pass()
    : fail('Expected recommendations and warnings to both be arrays.');
};

module.exports.editorCaseExpectationScore = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const review = parsed.value;
  const overallScore = Number(review?.overallScore);
  const minOverallScore = Number(context?.vars?.expectedMinOverallScore);
  const maxOverallScore = Number(context?.vars?.expectedMaxOverallScore);
  const scoreTolerance = Math.max(0, Number(context?.vars?.expectedScoreTolerance || 0));

  if (Number.isFinite(minOverallScore) && overallScore < (minOverallScore - scoreTolerance)) {
    return fail(`Expected overallScore >= ${minOverallScore}${scoreTolerance ? ` (tolerance ${scoreTolerance})` : ''}, received ${overallScore}.`);
  }
  if (Number.isFinite(maxOverallScore) && overallScore > (maxOverallScore + scoreTolerance)) {
    return fail(`Expected overallScore <= ${maxOverallScore}${scoreTolerance ? ` (tolerance ${scoreTolerance})` : ''}, received ${overallScore}.`);
  }

  const minCategoryScores = parseMaybeJson(context?.vars?.expectedMinCategoryScores, {});
  for (const [key, value] of Object.entries(minCategoryScores)) {
    if (Number(review?.categories?.[key]?.score) < (Number(value) - scoreTolerance)) {
      return fail(`Expected category '${key}' >= ${value}${scoreTolerance ? ` (tolerance ${scoreTolerance})` : ''}, received ${review?.categories?.[key]?.score}.`);
    }
  }

  const maxCategoryScores = parseMaybeJson(context?.vars?.expectedMaxCategoryScores, {});
  for (const [key, value] of Object.entries(maxCategoryScores)) {
    if (Number(review?.categories?.[key]?.score) > (Number(value) + scoreTolerance)) {
      return fail(`Expected category '${key}' <= ${value}${scoreTolerance ? ` (tolerance ${scoreTolerance})` : ''}, received ${review?.categories?.[key]?.score}.`);
    }
  }

  const requiredWarningTerms = asLowercaseTerms(context?.vars?.requiredWarningTerms);
  const warningBlob = (review?.warnings || []).join(' ').toLowerCase();
  const missingWarningTerm = requiredWarningTerms.find((term) => !warningBlob.includes(term));
  if (missingWarningTerm) {
    return fail(`Expected warnings to mention '${missingWarningTerm}'.`);
  }

  const concernBlob = [
    review?.rulesetSummary,
    review?.constructiveReview,
    ...(review?.recommendations || []),
    ...(review?.warnings || [])
  ].join(' ').toLowerCase();
  const requiredConcernTerms = asLowercaseTerms(context?.vars?.requiredConcernTerms);
  const missingConcernTerm = requiredConcernTerms.find((term) => !concernBlob.includes(term));
  if (missingConcernTerm) {
    return fail(`Expected review to mention concern '${missingConcernTerm}'.`);
  }

  const requiredConcernTermsAny = asLowercaseTerms(context?.vars?.requiredConcernTermsAny);
  if (requiredConcernTermsAny.length > 0 && !requiredConcernTermsAny.some((term) => concernBlob.includes(term))) {
    return fail(`Expected review to mention at least one concern term: ${requiredConcernTermsAny.join(', ')}.`);
  }

  return softScore(1, 'Scenario-specific editor expectations passed.');
};

module.exports.editorLatencyScore = (_output, context) => {
  const elapsedMs = Number(context?.providerResponse?.metadata?.elapsedMs || 0);
  const maxElapsedMs = Number(context?.vars?.maxElapsedMs || 0);

  if (!maxElapsedMs || !Number.isFinite(elapsedMs)) {
    return pass('No editor latency budget configured for this case.');
  }

  if (elapsedMs <= maxElapsedMs) {
    return softScore(1, `Editor latency ${elapsedMs}ms stayed within ${maxElapsedMs}ms.`);
  }

  if (elapsedMs <= maxElapsedMs * 1.25) {
    return softScore(0.3, `Editor latency ${elapsedMs}ms slightly exceeded ${maxElapsedMs}ms.`);
  }

  return fail(`Editor latency ${elapsedMs}ms exceeded the allowed ${maxElapsedMs}ms budget.`);
};

module.exports.brokenCompilerHandledSafely = (output, context) => {
  const envelope = getEnvelope(output, context);
  if (envelope.error) {
    return fail(envelope.error);
  }

  if (normalizeText(envelope.value?.ruleset?.compilerStatus) !== 'error') {
    return pass('Compiler status is not error; skipping broken-compiler checks.');
  }

  const judgment = envelope.value?.judgment || {};
  const warningBlob = getUserFacingText(judgment).toLowerCase();
  if (envelope.value?.success !== false) {
    return fail('Broken compiler case must not be marked as success.');
  }
  if (!['error', 'fallback-error'].includes(envelope.value?.reviewSource)) {
    return fail(`Broken compiler case must use error-style source, received '${envelope.value?.reviewSource}'.`);
  }
  if (Number(judgment?.overallScore) > 2) {
    return fail(`Broken compiler case should not carry a normal positive score, received ${judgment?.overallScore}.`);
  }
  if (!/compile|compiler|endif|syntax|invalid/i.test(warningBlob)) {
    return fail('Broken compiler case must clearly mention compile failure guidance.');
  }

  return pass();
};

module.exports.noRepeatedNarrativeAcrossCases = (output, context) => {
  const envelope = getEnvelope(output, context);
  if (envelope.error) {
    return fail(envelope.error);
  }

  const value = envelope.value || {};
  const signature = normalizeText(value.narrativeSignature);
  const caseId = normalizeText(value.caseId);
  const sourceHash = normalizeText(value.ruleset?.sourceHash);

  if (!signature || !caseId || !sourceHash) {
    return pass('Narrative signature unavailable.');
  }

  const previous = seenNarratives.get(signature);
  if (previous && previous.caseId !== caseId && previous.sourceHash !== sourceHash) {
    return fail(`Narrative matches case '${previous.caseId}' despite a different source hash. The output looks template-like.`);
  }

  seenNarratives.set(signature, { caseId, sourceHash });
  return pass();
};

module.exports.noForbiddenPhrases = (output, context) => {
  const parsed = getJudgment(output, context);
  if (parsed.error) {
    return fail(parsed.error);
  }

  const userFacingText = getUserFacingText(parsed.value);
  const matched = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(userFacingText));
  return matched
    ? fail(`Editor output should not contain forbidden phrase pattern '${matched}'.`)
    : pass();
};
