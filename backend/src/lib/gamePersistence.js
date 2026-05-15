const SavedGame = require('../../models/SavedGame');
const MatchHistory = require('../../models/MatchHistory');
const User = require('../../models/User');
const {
  calculateMultiplayerEloChanges,
  getRankNameFromElo,
  getRankTierForElo,
  normalizeEloValue
} = require('./elo');
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

function buildSavedGameStandings(savedGameOrSnapshot, eloDeltaByUserId = {}) {
  const snapshot = savedGameOrSnapshot?.snapshot || savedGameOrSnapshot || {};
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const pointsByPlayer = snapshot.pointsByPlayer || {};
  const collectedByPlayer = snapshot.collectedByPlayer || {};
  const handsReady = snapshot.handsReady || {};

  return players
    .map((player) => ({
      userId: player.userId,
      name: player.name || player.displayName || 'Player',
      guest: Boolean(player.guest),
      isBot: Boolean(player.isBot),
      connectionStatus: player.connectionStatus || (player.isConnected === false ? 'reconnecting' : 'connected'),
      replacementForUserId: player.replacementForUserId || null,
      replacementForName: player.replacementForName || null,
      elo: typeof player.elo === 'number' ? player.elo : null,
      rankName: player.rankName || null,
      rankTierKey: player.rankTierKey || null,
      eloDelta: eloDeltaByUserId?.[player.userId] ?? 0,
      points: Number(pointsByPlayer?.[player.userId] || 0),
      tricksWon: Array.isArray(collectedByPlayer?.[player.userId]) ? collectedByPlayer[player.userId].length : 0,
      cardsLeft: Array.isArray(handsReady?.[player.userId]) ? handsReady[player.userId].length : 0
    }))
    .sort((left, right) => {
      if (right.points !== left.points) {
        return right.points - left.points;
      }

      if (right.tricksWon !== left.tricksWon) {
        return right.tricksWon - left.tricksWon;
      }

      return left.name.localeCompare(right.name);
    });
}

function buildNumberedSavedGameStandings(savedGameOrSnapshot, eloDeltaByUserId = {}) {
  return buildSavedGameStandings(savedGameOrSnapshot, eloDeltaByUserId).map((standing, index) => ({
    ...standing,
    finalRank: index + 1
  }));
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
    eloApplied: Boolean(game.eloApplied),
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

async function finalizeEndedSavedGame(savedGame) {
  if (!savedGame?.matchKey) {
    return null;
  }

  const existingHistory = await MatchHistory.findOne({ matchKey: savedGame.matchKey });
  if (existingHistory) {
    return existingHistory;
  }

  const baseStandings = buildSavedGameStandings(savedGame);
  const ratedParticipantIds = baseStandings
    .filter((standing) => !standing.guest && !standing.isBot && standing.userId)
    .map((standing) => String(standing.userId));

  let eloResults = [];
  if (ratedParticipantIds.length >= 2) {
    const persistedUsers = await User.find({ _id: { $in: ratedParticipantIds } }).select('_id elo');
    const usersById = new Map(persistedUsers.map((user) => [String(user._id), user]));
    const participants = ratedParticipantIds
      .map((userId) => usersById.get(userId))
      .filter(Boolean)
      .map((user) => ({
        userId: String(user._id),
        elo: user.elo
      }));

    if (participants.length >= 2) {
      const calculation = calculateMultiplayerEloChanges(participants, baseStandings);
      if (calculation.applied && calculation.results.length > 0) {
        await User.bulkWrite(
          calculation.results.map((result) => ({
            updateOne: {
              filter: { _id: result.userId },
              update: { $set: { elo: result.nextElo } }
            }
          }))
        );
        eloResults = calculation.results;
      }
    }
  }

  const eloDeltaByUserId = eloResults.reduce((acc, result) => {
    acc[result.userId] = result.delta;
    return acc;
  }, {});
  const standings = buildNumberedSavedGameStandings(savedGame, eloDeltaByUserId);

  return createMatchHistoryOnce({
    game: {
      matchKey: savedGame.matchKey,
      roomName: savedGame.roomName || savedGame.snapshot?.roomName || 'Saved Match',
      roundNumber: Number(savedGame.roundsFinished || savedGame.snapshot?.roundNumber || 0),
      lastEloResults: eloResults,
      eloApplied: eloResults.length > 0
    },
    standings,
    savedGameId: savedGame._id
  });
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
    eloApplied: Boolean(matchHistory.eloApplied),
    standings: cloneJsonSafe(matchHistory.standings || []),
    viewerSummary: cloneJsonSafe(viewerSummary || null)
  };
}

module.exports = {
  MatchHistory,
  SavedGame,
  buildSavedGameStandings,
  buildSavedGameSnapshot,
  createMatchHistoryOnce,
  createSavedGameDocument,
  finalizeEndedSavedGame,
  serializeMatchHistoryForLibrary,
  serializeSavedGameForLibrary
};
