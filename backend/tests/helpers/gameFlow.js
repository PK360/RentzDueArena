const assert = require('node:assert');

const { createTestBot } = require('./builders');

function createMockIo() {
  const emitted = [];
  const io = {
    to(target) {
      return {
        emit(event, payload) {
          emitted.push({ target, event, payload });
        }
      };
    }
  };

  return { io, emitted };
}

function createSixBotRoom(overrides = {}) {
  const players = overrides.players || Array.from({ length: 6 }, (_, index) => createTestBot({
    userId: `bot-${index + 1}`,
    socketId: `socket-${index + 1}`,
    name: `Bot ${index + 1}`,
    displayName: `Bot ${index + 1}`,
    isReady: true,
    role: 'player',
    seatIndex: index,
    joinOrder: index + 1,
    isConnected: true,
    connectionStatus: 'connected'
  }));
  const selectedRulesets = overrides.selectedRulesets || { whist: true };

  return {
    roomId: overrides.roomId || 'BOT6FLOW',
    roomName: overrides.roomName || 'Six Bot Flow',
    hostId: overrides.hostId || players[0].userId,
    rulesetId: null,
    customRulesets: overrides.customRulesets || [],
    selectedRulesets,
    rulesetPermissions: overrides.rulesetPermissions || Object.fromEntries(
      players.map((player) => [player.userId, Object.fromEntries(
        Object.keys(selectedRulesets).map((ruleId) => [ruleId, true])
      )])
    ),
    nvAllowed: overrides.nvAllowed ?? false,
    autoBotReplacementEnabled: overrides.autoBotReplacementEnabled ?? true,
    useTurnTimer: overrides.useTurnTimer ?? false,
    turnTimerSeconds: overrides.turnTimerSeconds ?? 45,
    players,
    spectators: overrides.spectators || [],
    status: overrides.status || 'waiting'
  };
}

function getRoundActivePlayerIds(game) {
  const storedIds = Array.isArray(game?.roundActivePlayerIds) ? game.roundActivePlayerIds.filter(Boolean) : [];
  if (storedIds.length > 0) {
    return storedIds;
  }

  return Array.isArray(game?.players)
    ? game.players.map((player) => player?.userId).filter(Boolean)
    : [];
}

function buildInvariantSnapshot(game, {
  step = '',
  expectedDeckSize = null,
  initialActivePlayerIds = null
} = {}) {
  const playerIds = Array.isArray(game?.players)
    ? game.players.map((player) => player?.userId).filter(Boolean)
    : [];
  const roundActivePlayerIds = getRoundActivePlayerIds(game);
  const currentTrickPlayerIds = Array.isArray(game?.currentTrick)
    ? game.currentTrick.map((play) => play?.playedBy).filter(Boolean)
    : [];
  const handSizes = Object.fromEntries(
    roundActivePlayerIds.map((playerId) => [playerId, Array.isArray(game?.handsReady?.[playerId]) ? game.handsReady[playerId].length : null])
  );
  const completedCardCount = Array.isArray(game?.collectedHands)
    ? game.collectedHands.reduce((sum, trick) => sum + (Array.isArray(trick) ? trick.length : 0), 0)
    : 0;
  const cardsInHands = Object.values(handSizes).reduce((sum, handSize) => sum + (Number.isFinite(handSize) ? handSize : 0), 0);

  return {
    step,
    phase: game?.phase || null,
    roundNumber: Number(game?.roundNumber || 0),
    turnIndex: Number(game?.turnIndex || 0),
    currentPlayerId: game?.currentPlayerId || null,
    playersMarkedCurrent: Array.isArray(game?.players)
      ? game.players
        .filter((player) => Boolean(player?.isCurrent || player?.current || player?.isTurn))
        .map((player) => player.userId)
      : [],
    playerIds,
    roundActivePlayerIds,
    duplicatePlayerIds: playerIds.filter((playerId, index) => playerIds.indexOf(playerId) !== index),
    duplicateRoundActivePlayerIds: roundActivePlayerIds.filter((playerId, index) => roundActivePlayerIds.indexOf(playerId) !== index),
    missingActivePlayerIds: roundActivePlayerIds.filter((playerId) => !playerIds.includes(playerId)),
    initialActivePlayerIds: initialActivePlayerIds ? [...initialActivePlayerIds] : null,
    handSizes,
    currentTrickLength: currentTrickPlayerIds.length,
    currentTrickPlayerIds,
    collectedHandsCount: Array.isArray(game?.collectedHands) ? game.collectedHands.length : 0,
    cardsInHands,
    cardsInCurrentTrick: currentTrickPlayerIds.length,
    cardsInCollectedHands: completedCardCount,
    expectedDeckSize
  };
}

function formatInvariantMessage(message, game, options = {}) {
  return `${message}: ${JSON.stringify(buildInvariantSnapshot(game, options))}`;
}

function assertUniqueActivePlayers(game, {
  expectedCount = null,
  initialActivePlayerIds = null,
  step = ''
} = {}) {
  const roundActivePlayerIds = getRoundActivePlayerIds(game);
  const uniqueIds = new Set(roundActivePlayerIds);

  if (expectedCount !== null) {
    assert.strictEqual(
      roundActivePlayerIds.length,
      expectedCount,
      formatInvariantMessage('Unexpected active player count', game, { step, initialActivePlayerIds })
    );
  }

  assert.strictEqual(
    uniqueIds.size,
    roundActivePlayerIds.length,
    formatInvariantMessage('Duplicate round-active player ids detected', game, { step, initialActivePlayerIds })
  );
  assert.deepStrictEqual(
    [...uniqueIds].sort(),
    roundActivePlayerIds.slice().sort(),
    formatInvariantMessage('Round-active player ids changed unexpectedly', game, { step, initialActivePlayerIds })
  );
}

function assertValidCurrentPlayer(game, {
  step = '',
  requireCurrentPlayer = game?.phase === 'playing_round'
} = {}) {
  const roundActivePlayerIds = getRoundActivePlayerIds(game);
  const playersMarkedCurrent = Array.isArray(game?.players)
    ? game.players.filter((player) => Boolean(player?.isCurrent || player?.current || player?.isTurn))
    : [];

  if (requireCurrentPlayer) {
    assert.ok(
      game?.currentPlayerId,
      formatInvariantMessage('Missing current player during active play', game, { step })
    );
    assert.ok(
      roundActivePlayerIds.includes(game.currentPlayerId),
      formatInvariantMessage('Current player is not round-active', game, { step })
    );
  }

  if (playersMarkedCurrent.length > 0) {
    assert.strictEqual(
      playersMarkedCurrent.length,
      1,
      formatInvariantMessage('Multiple players are marked current', game, { step })
    );
    assert.strictEqual(
      playersMarkedCurrent[0].userId,
      game.currentPlayerId,
      formatInvariantMessage('Current flags do not match currentPlayerId', game, { step })
    );
  }
}

function assertValidHands(game, {
  expectedHandSize = null,
  step = ''
} = {}) {
  const roundActivePlayerIds = getRoundActivePlayerIds(game);
  const handSizes = roundActivePlayerIds.map((playerId) => {
    assert.ok(
      Array.isArray(game?.handsReady?.[playerId]),
      formatInvariantMessage('Missing active player hand', game, { step })
    );
    return game.handsReady[playerId].length;
  });

  if (expectedHandSize !== null) {
    assert.deepStrictEqual(
      handSizes,
      Array.from({ length: roundActivePlayerIds.length }, () => expectedHandSize),
      formatInvariantMessage('Unexpected dealt hand sizes', game, { step })
    );
  }
}

function assertCurrentTrickValid(game, {
  step = ''
} = {}) {
  const roundActivePlayerIds = getRoundActivePlayerIds(game);
  const currentTrickPlayerIds = Array.isArray(game?.currentTrick)
    ? game.currentTrick.map((play) => play?.playedBy).filter(Boolean)
    : [];

  assert.ok(
    currentTrickPlayerIds.length <= new Set(roundActivePlayerIds).size,
    formatInvariantMessage('Current trick exceeds active player count', game, { step })
  );
  assert.strictEqual(
    new Set(currentTrickPlayerIds).size,
    currentTrickPlayerIds.length,
    formatInvariantMessage('Duplicate trick participants detected', game, { step })
  );
  assert.ok(
    currentTrickPlayerIds.every((playerId) => roundActivePlayerIds.includes(playerId)),
    formatInvariantMessage('Current trick contains a non-active player', game, { step })
  );
}

function assertCardConservation(game, {
  expectedDeckSize,
  step = ''
} = {}) {
  const snapshot = buildInvariantSnapshot(game, { step, expectedDeckSize });
  assert.strictEqual(
    snapshot.cardsInHands + snapshot.cardsInCurrentTrick + snapshot.cardsInCollectedHands,
    expectedDeckSize,
    formatInvariantMessage('Card conservation failed', game, { step, expectedDeckSize })
  );
}

function assertParticipantConservation(game, initialActivePlayerIds, {
  step = ''
} = {}) {
  const roundActivePlayerIds = getRoundActivePlayerIds(game);

  assert.deepStrictEqual(
    [...new Set(roundActivePlayerIds)].sort(),
    [...new Set(initialActivePlayerIds)].sort(),
    formatInvariantMessage('Round-active participants changed unexpectedly', game, {
      step,
      initialActivePlayerIds
    })
  );
}

function assertNoDeadlockState(game, {
  step = ''
} = {}) {
  if (game?.phase !== 'playing_round') {
    return;
  }

  const roundActivePlayerIds = getRoundActivePlayerIds(game);
  const hasRemainingCards = roundActivePlayerIds.some((playerId) => (game?.handsReady?.[playerId] || []).length > 0);
  if (!hasRemainingCards) {
    return;
  }

  assertValidCurrentPlayer(game, { step });
  assertCurrentTrickValid(game, { step });
}

function assertRoundInvariants(game, {
  expectedDeckSize,
  initialActivePlayerIds,
  step = '',
  expectedHandSize = null
} = {}) {
  assertUniqueActivePlayers(game, {
    expectedCount: initialActivePlayerIds ? initialActivePlayerIds.length : null,
    initialActivePlayerIds,
    step
  });
  assertParticipantConservation(game, initialActivePlayerIds || getRoundActivePlayerIds(game), { step });
  assertValidCurrentPlayer(game, { step });
  assertValidHands(game, { expectedHandSize, step });
  assertCurrentTrickValid(game, { step });
  assertCardConservation(game, { expectedDeckSize, step });
  assertNoDeadlockState(game, { step });
}

function playOneLegalMove(io, roomId, game, {
  playCardForPlayer,
  getLegalCardsForPlayer,
  expectedDeckSize,
  initialActivePlayerIds,
  step = ''
} = {}) {
  assertRoundInvariants(game, {
    expectedDeckSize,
    initialActivePlayerIds,
    step: `${step}:beforeMove`
  });

  const playerId = game.currentPlayerId;
  const legalCards = getLegalCardsForPlayer(game, playerId);
  assert.ok(
    legalCards.length > 0,
    formatInvariantMessage('Current player has no legal moves', game, { step })
  );

  const card = legalCards[0];
  const result = playCardForPlayer(io, roomId, playerId, card, { auto: true });
  assert.deepStrictEqual(
    result,
    { success: true },
    formatInvariantMessage('Legal move failed unexpectedly', game, { step })
  );

  if (game.phase === 'playing_round') {
    assertRoundInvariants(game, {
      expectedDeckSize,
      initialActivePlayerIds,
      step: `${step}:afterMove`
    });
  }

  return {
    playerId,
    card,
    result
  };
}

function playOneCompleteTrick(io, roomId, game, {
  playCardForPlayer,
  getLegalCardsForPlayer,
  expectedDeckSize,
  initialActivePlayerIds,
  step = 'completeTrick'
} = {}) {
  let moveCount = 0;
  const maxMoves = getRoundActivePlayerIds(game).length + 1;

  do {
    playOneLegalMove(io, roomId, game, {
      playCardForPlayer,
      getLegalCardsForPlayer,
      expectedDeckSize,
      initialActivePlayerIds,
      step: `${step}:move${moveCount + 1}`
    });
    moveCount += 1;
  } while (game.phase === 'playing_round' && game.currentTrick.length > 0 && moveCount < maxMoves);

  assert.ok(
    moveCount <= maxMoves,
    formatInvariantMessage('A single trick exceeded the move guard', game, { step, expectedDeckSize, initialActivePlayerIds })
  );
}

function playUntilRoundEnd(io, roomId, game, {
  playCardForPlayer,
  getLegalCardsForPlayer,
  expectedDeckSize,
  initialActivePlayerIds,
  maxMoves = expectedDeckSize * 2
} = {}) {
  let moveCount = 0;

  while (game.phase === 'playing_round') {
    playOneLegalMove(io, roomId, game, {
      playCardForPlayer,
      getLegalCardsForPlayer,
      expectedDeckSize,
      initialActivePlayerIds,
      step: `roundMove${moveCount + 1}`
    });
    moveCount += 1;

    assert.ok(
      moveCount <= maxMoves,
      formatInvariantMessage('Round flow exceeded move guard', game, {
        step: `roundMove${moveCount}`,
        expectedDeckSize,
        initialActivePlayerIds
      })
    );
  }

  return moveCount;
}

function startGameWithBots(io, lobby, {
  buildGameStateFromLobby,
  beginChooserTurn,
  selectRulesetForRound,
  getEligibleRuleIdsForPlayer,
  preferredRulesetId = null
} = {}) {
  const game = buildGameStateFromLobby(lobby);
  game.chooserOrder = lobby.players.map((player) => player.userId);
  game.chooserCursor = 0;

  assert.strictEqual(
    beginChooserTurn(io, lobby.roomId, game),
    true,
    formatInvariantMessage('Failed to begin chooser turn', game, { step: 'beginChooserTurn' })
  );
  assert.strictEqual(
    game.phase,
    'choosing_ruleset',
    formatInvariantMessage('Unexpected phase after beginChooserTurn', game, { step: 'beginChooserTurn' })
  );

  const eligibleRuleIds = getEligibleRuleIdsForPlayer(game, game.chooserId);
  assert.ok(
    eligibleRuleIds.length > 0,
    formatInvariantMessage('Chooser has no eligible rulesets', game, { step: 'rulesetSelection' })
  );
  const selectedRulesetId = preferredRulesetId && eligibleRuleIds.includes(preferredRulesetId)
    ? preferredRulesetId
    : eligibleRuleIds[0];

  const selectionResult = selectRulesetForRound(io, lobby.roomId, game, game.chooserId, selectedRulesetId);
  assert.deepStrictEqual(
    selectionResult,
    { success: true },
    formatInvariantMessage('Failed to select ruleset for round', game, { step: 'rulesetSelection' })
  );

  return {
    game,
    selectedRulesetId
  };
}

module.exports = {
  assertCardConservation,
  assertCurrentTrickValid,
  assertNoDeadlockState,
  assertParticipantConservation,
  assertRoundInvariants,
  assertUniqueActivePlayers,
  assertValidCurrentPlayer,
  assertValidHands,
  buildInvariantSnapshot,
  createMockIo,
  createSixBotRoom,
  getRoundActivePlayerIds,
  playOneCompleteTrick,
  playOneLegalMove,
  playUntilRoundEnd,
  startGameWithBots
};
