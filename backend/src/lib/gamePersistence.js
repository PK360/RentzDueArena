const SavedGame = require('../../models/SavedGame');
const MatchHistory = require('../../models/MatchHistory');
const { getRankNameFromElo, getRankTierForElo, normalizeEloValue } = require('./elo');
const { getAvailableRulesets } = require('../../rulesets');

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function buildSavedGameSummaryFromSnapshot(snapshot = {}) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const pointsByPlayer = snapshot.pointsByPlayer || {};
  const standings = players
    .map((player) => ({
      userId: player.userId,
      name: player.name,
      points: Number(pointsByPlayer[player.userId] || 0)
    }))
    .sort((left, right) => {
      if (right.points !== left.points) {
        return right.points - left.points;
      }

      return left.name.localeCompare(right.name);
    });
  const leader = standings[0] || {};

  return {
    roundsFinished: Number(snapshot.roundNumber || 0),
    leaderUserId: leader.userId || '',
    leaderName: leader.name || '',
    leaderPoints: Number(leader.points || 0)
  };
}

function buildSavedGameSnapshot({ roomId, lobby, game }) {
  const snapshot = {
    roomId,
    roomName: lobby?.roomName || game?.roomName || '',
    visibility: lobby?.visibility || 'public',
    hostId: lobby?.hostId || game?.hostId || '',
    players: cloneJsonSafe(game?.players || lobby?.players || []),
    spectators: cloneJsonSafe(lobby?.spectators || []),
    customRulesets: cloneJsonSafe(game?.customRulesets || []),
    selectedRulesets: cloneJsonSafe(game?.selectedRulesets || lobby?.selectedRulesets || {}),
    rulesetPermissions: cloneJsonSafe(game?.rulesetPermissions || lobby?.rulesetPermissions || {}),
    nvAllowed: Boolean(game?.nvAllowed ?? lobby?.nvAllowed),
    autoBotReplacementEnabled: game?.autoBotReplacementEnabled !== false && lobby?.autoBotReplacementEnabled !== false,
    useTurnTimer: game?.useTurnTimer !== false && lobby?.useTurnTimer !== false,
    turnTimerSeconds: Number(game?.turnTimerSeconds || lobby?.turnTimerSeconds || 45),
    bannedUserIds: cloneJsonSafe(lobby?.bannedUserIds || []),
    mutedChatUserIds: cloneJsonSafe(lobby?.mutedChatUserIds || []),
    chooserOrder: cloneJsonSafe(game?.chooserOrder || []),
    chooserCursor: Number(game?.chooserCursor || 0),
    chooserId: game?.chooserId || null,
    usedChoices: cloneJsonSafe(game?.usedChoices || {}),
    activeRulesetId: game?.activeRulesetId || null,
    nvSelected: Boolean(game?.nvSelected),
    roundNumber: Number(game?.roundNumber || 0),
    handsReady: cloneJsonSafe(game?.handsReady || {}),
    stateVersion: Number(game?.stateVersion || 0),
    turnIndex: Number(game?.turnIndex || 0),
    trickPending: Boolean(game?.trickPending),
    currentTrick: cloneJsonSafe(game?.currentTrick || []),
    trickSuit: game?.trickSuit || null,
    collectedHands: cloneJsonSafe(game?.collectedHands || []),
    pointsByPlayer: cloneJsonSafe(game?.pointsByPlayer || {}),
    collectedByPlayer: cloneJsonSafe(game?.collectedByPlayer || {}),
    roundStats: cloneJsonSafe(game?.roundStats || null),
    lastRoundStats: cloneJsonSafe(game?.lastRoundStats || null),
    lastEloResults: cloneJsonSafe(game?.lastEloResults || []),
    lastEloDeltaByUserId: cloneJsonSafe(game?.lastEloDeltaByUserId || {}),
    gameFinishedEventSent: Boolean(game?.gameFinishedEventSent),
    phase: game?.phase || 'round_stats',
    status: game?.status || 'playing',
    abandonedPlayers: cloneJsonSafe(game?.abandonedPlayers || {}),
    chatMessages: cloneJsonSafe(game?.chatMessages || []),
    matchKey: game?.matchKey || `${roomId}:${Date.now().toString(36)}`
  };

  return {
    ...snapshot,
    ...buildSavedGameSummaryFromSnapshot(snapshot)
  };
}

async function createSavedGameDocument({ ownerUserId, roomId, lobby, game }) {
  const snapshot = buildSavedGameSnapshot({ roomId, lobby, game });
  const summary = buildSavedGameSummaryFromSnapshot(snapshot);

  const savedGame = await SavedGame.create({
    ownerUserId,
    status: 'saved',
    matchKey: snapshot.matchKey,
    roomName: snapshot.roomName,
    originalRoomId: roomId,
    hostUserId: snapshot.hostId,
    hostName: snapshot.players.find((player) => player.userId === snapshot.hostId)?.name || '',
    savedAt: new Date(),
    roundsFinished: summary.roundsFinished,
    leaderUserId: summary.leaderUserId,
    leaderName: summary.leaderName,
    leaderPoints: summary.leaderPoints,
    snapshot
  });

  return savedGame;
}

function serializeSavedGameForLibrary(savedGame) {
  if (!savedGame) {
    return null;
  }

  return {
    id: String(savedGame._id),
    ownerUserId: savedGame.ownerUserId ? String(savedGame.ownerUserId) : '',
    roomName: savedGame.roomName || savedGame.snapshot?.roomName || 'Saved Match',
    savedAt: savedGame.savedAt || savedGame.createdAt || null,
    roundsFinished: Number(savedGame.roundsFinished || savedGame.snapshot?.roundNumber || 0),
    leaderUserId: savedGame.leaderUserId || '',
    leaderName: savedGame.leaderName || '',
    leaderPoints: Number(savedGame.leaderPoints || 0),
    players: cloneJsonSafe(savedGame.snapshot?.players || []),
    usedChoices: cloneJsonSafe(savedGame.snapshot?.usedChoices || {}),
    availableRulesets: cloneJsonSafe(getAvailableRulesets(savedGame.snapshot?.customRulesets || [])),
    selectedRulesets: cloneJsonSafe(savedGame.snapshot?.selectedRulesets || {}),
    lastRoundStats: cloneJsonSafe(savedGame.snapshot?.lastRoundStats || null),
    phase: savedGame.snapshot?.phase || 'round_stats'
  };
}

function buildMatchHistoryDocument({ game, standings = [], savedGameId = null }) {
  const eloResults = Array.isArray(game?.lastEloResults) ? game.lastEloResults : [];
  const eloResultsByUserId = new Map(eloResults.map((result) => [String(result.userId), result]));
  const participantUserIds = standings
    .filter((standing) => !standing.guest && !standing.isBot)
    .map((standing) => standing.userId)
    .filter(Boolean);
  const userSummaries = participantUserIds.map((userId) => {
    const eloResult = eloResultsByUserId.get(String(userId)) || null;
    const standing = standings.find((entry) => entry.userId === userId) || {};
    const previousElo = normalizeEloValue(eloResult?.previousElo, standing.elo ?? 500);
    const nextElo = normalizeEloValue(eloResult?.nextElo, previousElo);

    return {
      userId,
      finalRank: Number(standing.finalRank || 0),
      eloDelta: Number(eloResult?.delta || 0),
      previousElo,
      nextElo,
      previousRankName: getRankNameFromElo(previousElo),
      nextRankName: getRankNameFromElo(nextElo),
      previousRankTierKey: getRankTierForElo(previousElo).key,
      nextRankTierKey: getRankTierForElo(nextElo).key,
      rankChanged: getRankTierForElo(previousElo).key !== getRankTierForElo(nextElo).key
    };
  });

  return {
    matchKey: game.matchKey,
    participantUserIds,
    roomName: game.roomName || 'Rentz Match',
    completedAt: new Date(),
    roundsPlayed: Number(game.roundNumber || 0),
    winnerUserId: standings[0]?.userId || '',
    winnerName: standings[0]?.name || '',
    standings: cloneJsonSafe(standings),
    eloResults: cloneJsonSafe(eloResults),
    userSummaries,
    sourceSavedGameId: savedGameId
  };
}

async function createMatchHistoryOnce({ game, standings, savedGameId = null }) {
  if (!game?.matchKey) {
    return null;
  }

  const existing = await MatchHistory.findOne({ matchKey: game.matchKey });
  if (existing) {
    return existing;
  }

  const document = buildMatchHistoryDocument({ game, standings, savedGameId });
  if (document.participantUserIds.length === 0) {
    return null;
  }

  return MatchHistory.create(document);
}

function serializeMatchHistoryForLibrary(matchHistory, viewerUserId) {
  if (!matchHistory) {
    return null;
  }

  const viewerSummary = (Array.isArray(matchHistory.userSummaries) ? matchHistory.userSummaries : [])
    .find((summary) => String(summary.userId) === String(viewerUserId));

  return {
    id: String(matchHistory._id),
    roomName: matchHistory.roomName || 'Rentz Match',
    completedAt: matchHistory.completedAt || matchHistory.createdAt || null,
    roundsPlayed: Number(matchHistory.roundsPlayed || 0),
    winnerUserId: matchHistory.winnerUserId || '',
    winnerName: matchHistory.winnerName || '',
    standings: cloneJsonSafe(matchHistory.standings || []),
    viewerSummary: cloneJsonSafe(viewerSummary || null)
  };
}

module.exports = {
  MatchHistory,
  SavedGame,
  buildSavedGameSnapshot,
  createMatchHistoryOnce,
  createSavedGameDocument,
  serializeMatchHistoryForLibrary,
  serializeSavedGameForLibrary
};
