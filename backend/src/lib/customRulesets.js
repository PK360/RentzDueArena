const crypto = require('crypto');

function buildRulesetContentHash({ title, shortName, type, code }) {
  return crypto.createHash('sha1')
    .update([
      String(title || '').trim(),
      String(shortName || '').trim(),
      String(type || '').trim(),
      String(code || '').trim()
    ].join('\n::\n'))
    .digest('hex');
}

function normalizeRulesetRatingValue(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error('Ruleset rating is invalid');
  }

  const roundedToHalf = Math.round(numericValue * 2) / 2;
  if (roundedToHalf < 0.5 || roundedToHalf > 5) {
    throw new Error('Ruleset ratings must be between 0.5 and 5 stars');
  }

  return roundedToHalf;
}

function serializeRulesetAuthor(user) {
  if (!user) {
    return null;
  }

  return {
    userId: String(user._id),
    id: String(user._id),
    username: user.username || user.displayName || 'Player',
    name: user.username || user.displayName || 'Player',
    displayName: user.username || user.displayName || 'Player',
    avatarUrl: user.profilePicture || '',
    profilePicture: user.profilePicture || '',
    banner: user.banner || '',
    elo: user.elo ?? user.rating ?? user.mmr ?? user.rank ?? null
  };
}

function computeRulesetRatingSummary(ruleset, viewer) {
  const ratings = Array.isArray(ruleset?.ratings) ? ruleset.ratings : [];
  const viewerId = viewer?._id ? String(viewer._id) : '';
  const total = ratings.reduce((sum, rating) => sum + Number(rating?.value || 0), 0);
  const averageRating = ratings.length > 0 ? Number((total / ratings.length).toFixed(2)) : null;
  const viewerRatingEntry = viewerId
    ? ratings.find((rating) => String(rating?.user || rating?.userId || '') === viewerId)
    : null;

  return {
    averageRating,
    ratingCount: ratings.length,
    viewerRating: viewerRatingEntry ? Number(viewerRatingEntry.value || 0) : null
  };
}

function serializeStoredRuleset(ruleset, viewer = null) {
  if (!ruleset) {
    return null;
  }

  const ratingSummary = computeRulesetRatingSummary(ruleset, viewer);

  return {
    id: String(ruleset._id),
    title: String(ruleset.title || ''),
    label: String(ruleset.title || ''),
    longName: String(ruleset.title || ''),
    shortName: String(ruleset.shortName || ''),
    abbreviation: String(ruleset.shortName || ''),
    description: String(ruleset.description || ''),
    type: String(ruleset.type || 'per_round'),
    code: String(ruleset.code || ''),
    isPublic: Boolean(ruleset.isPublic),
    createdAt: ruleset.createdAt || null,
    updatedAt: ruleset.updatedAt || null,
    author: serializeRulesetAuthor(ruleset.author),
    originalCreator: serializeRulesetAuthor(ruleset.author),
    averageRating: ratingSummary.averageRating,
    ratingCount: ratingSummary.ratingCount,
    viewerRating: ratingSummary.viewerRating
  };
}

module.exports = {
  buildRulesetContentHash,
  computeRulesetRatingSummary,
  normalizeRulesetRatingValue,
  serializeStoredRuleset
};
