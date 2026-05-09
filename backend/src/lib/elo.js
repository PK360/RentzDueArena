const DEFAULT_ACCOUNT_ELO = 500;
const ELO_K_FACTOR = Math.max(1, Number(process.env.RENTZ_ELO_K_FACTOR || 32));
const ELO_RANK_TIERS = Object.freeze([
  { key: 'starting-out-rentz-rookie', min: 0, max: 999, name: 'Starting-out Rentz Rookie' },
  { key: 'devoted-rentz-player', min: 1000, max: 1999, name: 'Devoted Rentz Player' },
  { key: 'practising-rentz-expert', min: 2000, max: 3999, name: 'Practising Rentz Expert' },
  { key: 'grand-rentz-master', min: 4000, max: 5999, name: 'Grand Rentz Master' },
  { key: 'divine-rentz-envoy', min: 6000, max: 7999, name: 'Divine Rentz Envoy' },
  { key: 'ennead-of-rentz-member', min: 8000, max: 9999, name: 'Ennead of Rentz Member' },
  { key: 'ancestral-rentz-god', min: 10000, max: null, name: 'Ancestral Rentz God' }
]);

function normalizeEloValue(value, fallback = DEFAULT_ACCOUNT_ELO) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return Math.max(0, Math.round(fallback));
  }

  return Math.max(0, Math.round(numericValue));
}

function getUserModel() {
  return require('../../models/User');
}

function getRankTierForElo(elo) {
  const normalizedElo = normalizeEloValue(elo);
  return ELO_RANK_TIERS.find((tier) => (
    normalizedElo >= tier.min
    && (tier.max == null || normalizedElo <= tier.max)
  )) || ELO_RANK_TIERS[0];
}

function getRankNameFromElo(elo) {
  return getRankTierForElo(elo).name;
}

function getRankBoundsForElo(elo) {
  const tier = getRankTierForElo(elo);
  return {
    key: tier.key,
    name: tier.name,
    min: tier.min,
    max: tier.max
  };
}

function calculateExpectedScore(playerElo, opponentElo) {
  return 1 / (1 + (10 ** ((opponentElo - playerElo) / 400)));
}

function compareStandingsForElo(leftStanding = {}, rightStanding = {}) {
  const leftPoints = Number(leftStanding.points || 0);
  const rightPoints = Number(rightStanding.points || 0);

  if (leftPoints !== rightPoints) {
    return leftPoints > rightPoints ? 1 : -1;
  }

  const leftTricksWon = Number(leftStanding.tricksWon || 0);
  const rightTricksWon = Number(rightStanding.tricksWon || 0);

  if (leftTricksWon !== rightTricksWon) {
    return leftTricksWon > rightTricksWon ? 1 : -1;
  }

  return 0;
}

function normalizeLeaderboardUsers(users = []) {
  return [...users].sort((left, right) => {
    const leftElo = normalizeEloValue(left?.elo, 0);
    const rightElo = normalizeEloValue(right?.elo, 0);

    if (rightElo !== leftElo) {
      return rightElo - leftElo;
    }

    const leftUsername = String(left?.usernameLower || left?.username || left?.displayName || '');
    const rightUsername = String(right?.usernameLower || right?.username || right?.displayName || '');
    return leftUsername.localeCompare(rightUsername);
  });
}

function assignLeaderboardPlacements(entries = []) {
  let previousElo = null;
  let previousPlacement = 0;

  return entries.map((entry, index) => {
    const entryElo = normalizeEloValue(entry?.elo, 0);
    const placement = index === 0 || entryElo !== previousElo
      ? index + 1
      : previousPlacement;

    previousElo = entryElo;
    previousPlacement = placement;

    return {
      ...entry,
      placement
    };
  });
}

function buildPublicLeaderboardEntry(user, extra = {}) {
  const elo = normalizeEloValue(user?.elo);
  const rank = getRankTierForElo(elo);
  const userId = String(user?._id || user?.userId || user?.id || '');
  const profilePicture = user?.profilePicture || user?.avatarUrl || '';

  return {
    userId,
    username: user?.username || user?.displayName || user?.name || 'Player',
    name: user?.username || user?.displayName || user?.name || 'Player',
    displayName: user?.username || user?.displayName || user?.name || 'Player',
    profilePicture,
    avatarUrl: profilePicture,
    guest: false,
    elo,
    rankName: rank.name,
    rankTierKey: rank.key,
    placement: extra.placement ?? null,
    isCurrentUser: Boolean(extra.currentUserId) && userId === String(extra.currentUserId)
  };
}

function roundEloChangesWithZeroSum(results = []) {
  const rounded = results.map((result) => ({
    ...result,
    delta: Math.round(result.rawDelta)
  }));
  let sum = rounded.reduce((acc, result) => acc + result.delta, 0);

  while (sum !== 0 && rounded.length > 0) {
    const sortedIndexes = [...rounded.keys()].sort((leftIndex, rightIndex) => {
      const left = rounded[leftIndex];
      const right = rounded[rightIndex];
      const leftBias = sum > 0
        ? (left.delta - left.rawDelta)
        : (left.rawDelta - left.delta);
      const rightBias = sum > 0
        ? (right.delta - right.rawDelta)
        : (right.rawDelta - right.delta);

      if (rightBias !== leftBias) {
        return rightBias - leftBias;
      }

      return String(left.userId).localeCompare(String(right.userId));
    });

    const target = rounded[sortedIndexes[0]];
    if (!target) {
      break;
    }

    target.delta += sum > 0 ? -1 : 1;
    sum += sum > 0 ? -1 : 1;
  }

  return rounded;
}

function calculateMultiplayerEloChanges(participants = [], standings = [], { kFactor = ELO_K_FACTOR } = {}) {
  const normalizedParticipants = participants
    .filter((participant) => participant?.userId)
    .map((participant) => ({
      userId: String(participant.userId),
      elo: normalizeEloValue(participant.elo)
    }));

  if (normalizedParticipants.length < 2) {
    return {
      applied: false,
      reason: 'not-enough-rated-players',
      kFactor,
      results: []
    };
  }

  const standingsByUserId = new Map(
    (Array.isArray(standings) ? standings : []).map((standing) => [String(standing.userId), standing])
  );
  const pairCount = normalizedParticipants.length - 1;
  const rawDeltasByUserId = normalizedParticipants.reduce((acc, participant) => {
    acc[participant.userId] = 0;
    return acc;
  }, {});

  for (let leftIndex = 0; leftIndex < normalizedParticipants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedParticipants.length; rightIndex += 1) {
      const left = normalizedParticipants[leftIndex];
      const right = normalizedParticipants[rightIndex];
      const leftStanding = standingsByUserId.get(left.userId) || {};
      const rightStanding = standingsByUserId.get(right.userId) || {};
      const comparison = compareStandingsForElo(leftStanding, rightStanding);
      const actualScore = comparison > 0 ? 1 : comparison < 0 ? 0 : 0.5;
      const expectedScore = calculateExpectedScore(left.elo, right.elo);
      const delta = kFactor * (actualScore - expectedScore);

      rawDeltasByUserId[left.userId] += delta;
      rawDeltasByUserId[right.userId] -= delta;
    }
  }

  const roundedResults = roundEloChangesWithZeroSum(
    normalizedParticipants.map((participant) => ({
      userId: participant.userId,
      previousElo: participant.elo,
      rawDelta: rawDeltasByUserId[participant.userId] / pairCount
    }))
  );

  return {
    applied: true,
    reason: null,
    kFactor,
    results: roundedResults.map((result) => {
      const nextElo = normalizeEloValue(result.previousElo + result.delta, 0);
      const appliedDelta = nextElo - result.previousElo;

      return {
        userId: result.userId,
        previousElo: result.previousElo,
        delta: appliedDelta,
        nextElo,
        rankName: getRankNameFromElo(nextElo),
        rankTierKey: getRankTierForElo(nextElo).key
      };
    })
  };
}

function buildRankQueryForElo(elo) {
  const rankBounds = getRankBoundsForElo(elo);

  return rankBounds.max == null
    ? { elo: { $gte: rankBounds.min } }
    : { elo: { $gte: rankBounds.min, $lte: rankBounds.max } };
}

async function migrateUsersMissingElo() {
  const User = getUserModel();
  const result = await User.updateMany(
    {
      $or: [
        { elo: { $exists: false } },
        { elo: null }
      ]
    },
    {
      $set: { elo: DEFAULT_ACCOUNT_ELO }
    }
  );

  return result?.modifiedCount || 0;
}

async function getGlobalPlacementForUser(user) {
  if (!user?._id) {
    return null;
  }

  const elo = normalizeEloValue(user.elo);
  const User = getUserModel();
  const higherRatedCount = await User.countDocuments({ elo: { $gt: elo } });
  return higherRatedCount + 1;
}

async function buildCompetitiveSummaryForUser(user) {
  if (!user) {
    return {
      elo: DEFAULT_ACCOUNT_ELO,
      rankName: getRankNameFromElo(DEFAULT_ACCOUNT_ELO),
      rankTierKey: getRankTierForElo(DEFAULT_ACCOUNT_ELO).key,
      globalPlacement: null
    };
  }

  const elo = normalizeEloValue(user.elo);
  const rankTier = getRankTierForElo(elo);

  return {
    elo,
    rankName: rankTier.name,
    rankTierKey: rankTier.key,
    globalPlacement: await getGlobalPlacementForUser(user)
  };
}

async function getRankLeaderboardForUser(user) {
  if (!user?._id) {
    return {
      currentUserId: null,
      rankName: getRankNameFromElo(DEFAULT_ACCOUNT_ELO),
      rankTierKey: getRankTierForElo(DEFAULT_ACCOUNT_ELO).key,
      entries: []
    };
  }

  const elo = normalizeEloValue(user.elo);
  const rankBounds = getRankBoundsForElo(elo);
  const User = getUserModel();
  const users = await User.find(buildRankQueryForElo(elo))
    .select('username usernameLower profilePicture elo')
    .sort({ elo: -1, usernameLower: 1 })
    .lean();

  const entries = assignLeaderboardPlacements(
    normalizeLeaderboardUsers(users).map((entry) => buildPublicLeaderboardEntry(entry, {
      currentUserId: String(user._id)
    }))
  );

  return {
    currentUserId: String(user._id),
    rankName: rankBounds.name,
    rankTierKey: rankBounds.key,
    rankMinElo: rankBounds.min,
    rankMaxElo: rankBounds.max,
    entries
  };
}

async function getRankLeaderboardForUserId(userId, { viewer = null } = {}) {
  const User = getUserModel();
  const targetUser = userId ? await User.findById(userId) : null;

  if (!targetUser) {
    return null;
  }

  const leaderboard = await getRankLeaderboardForUser(targetUser);

  return {
    ...leaderboard,
    currentUserId: viewer?._id ? String(viewer._id) : null,
    highlightedUserId: String(targetUser._id),
    entries: leaderboard.entries.map((entry) => ({
      ...entry,
      isCurrentUser: viewer?._id ? entry.userId === String(viewer._id) : false,
      isHighlightedUser: entry.userId === String(targetUser._id)
    }))
  };
}

module.exports = {
  DEFAULT_ACCOUNT_ELO,
  ELO_K_FACTOR,
  ELO_RANK_TIERS,
  assignLeaderboardPlacements,
  buildCompetitiveSummaryForUser,
  buildPublicLeaderboardEntry,
  calculateExpectedScore,
  calculateMultiplayerEloChanges,
  compareStandingsForElo,
  getGlobalPlacementForUser,
  getRankLeaderboardForUserId,
  getRankBoundsForElo,
  getRankLeaderboardForUser,
  getRankNameFromElo,
  getRankTierForElo,
  migrateUsersMissingElo,
  normalizeEloValue
};
