const assert = require('node:assert');

const {
  BOT_TYPE_TRAINER,
  buildBotIdentity,
  chooseFallbackMove,
  chooseBotMove,
  getAverageHumanElo,
  getBotDifficultyElo,
  getGameplayBotRuntimeConfig,
  getNextBotOrdinal,
  getTrainerRuntimeConfig,
  parseGameplayDecisionOutput
} = require('../src/lib/bots');

test('computes room-average human elo while ignoring bots', () => {
  const average = getAverageHumanElo([
    { userId: 'human-1', elo: 1000 },
    { userId: 'human-2', elo: 2000 },
    { userId: 'bot-1', elo: 9000, isBot: true }
  ]);

  assert.strictEqual(average, 1500);
});

test('defaults bot average elo to 500 when no human elo is available', () => {
  const average = getAverageHumanElo([
    { userId: 'bot-1', elo: 2400, isBot: true },
    { userId: 'guest-1', guest: true, elo: null }
  ]);

  assert.strictEqual(average, 500);
});

test('builds bot identities from the average human elo tier', () => {
  const bot = buildBotIdentity({
    roomId: 'ROOM77',
    seatIndex: 2,
    players: [
      { userId: 'human-1', elo: 2400 },
      { userId: 'human-2', elo: 2600 }
    ]
  });

  assert.strictEqual(bot.isBot, true);
  assert.strictEqual(bot.elo, 2500);
  assert.strictEqual(bot.rankName, 'Practising Rentz Expert');
  assert.strictEqual(bot.rankTierKey, 'practising-rentz-expert');
});

test('starts bot numbering at 1 and reuses the lowest open bot ordinal', () => {
  assert.strictEqual(getNextBotOrdinal([]), 1);
  assert.strictEqual(getNextBotOrdinal([
    { isBot: true, name: 'Table Bot 1' },
    { isBot: true, name: 'Trick Bot 3' }
  ]), 2);

  const firstBot = buildBotIdentity({
    roomId: 'ROOM91',
    seatIndex: 1,
    players: [{ userId: 'human-1', elo: 1200 }]
  });
  const secondBot = buildBotIdentity({
    roomId: 'ROOM91',
    seatIndex: 2,
    players: [{ userId: 'human-1', elo: 1200 }, firstBot]
  });

  assert.match(firstBot.displayName, /\b1$/);
  assert.match(secondBot.displayName, /\b2$/);
});

test('avoids bot identity collisions when a seat index is reused', () => {
  const existingBots = [
    buildBotIdentity({
      roomId: 'ROOM91',
      seatIndex: 1,
      players: [{ userId: 'human-1', elo: 1200 }]
    }),
    buildBotIdentity({
      roomId: 'ROOM91',
      seatIndex: 2,
      players: [{ userId: 'human-1', elo: 1200 }]
    }),
    buildBotIdentity({
      roomId: 'ROOM91',
      seatIndex: 3,
      players: [{ userId: 'human-1', elo: 1200 }]
    })
  ];
  const shiftedSeatBot = buildBotIdentity({
    roomId: 'ROOM91',
    seatIndex: 3,
    players: [{ userId: 'human-1', elo: 1200 }, ...existingBots]
  });

  assert.equal(existingBots.some((player) => player.userId === shiftedSeatBot.userId), false);
  assert.equal(existingBots.some((player) => player.socketId === shiftedSeatBot.socketId), false);
});

test('chooses a deterministic legal fallback move', () => {
  const move = chooseFallbackMove('play_card', [
    { id: 'A-S', card: 'A-S' },
    { id: '2-C', card: '2-C' },
    { id: '10-D', card: '10-D' }
  ]);

  assert.strictEqual(move.id, '2-C');
});

test('builds Trainer identities with fixed elo and trainer metadata', () => {
  const trainer = buildBotIdentity({
    roomId: 'TRN001',
    seatIndex: 1,
    players: [{ userId: 'human-1', elo: 1200 }],
    botType: BOT_TYPE_TRAINER,
    fixedElo: 6400
  });

  assert.strictEqual(trainer.isBot, true);
  assert.strictEqual(trainer.isTrainer, true);
  assert.strictEqual(trainer.botType, BOT_TYPE_TRAINER);
  assert.strictEqual(trainer.displayName, 'Trainer');
  assert.strictEqual(trainer.elo, 6400);
  assert.strictEqual(trainer.rankName, 'Divine Rentz Envoy');
  assert.match(trainer.socketId, /^trainer:/);
});

test('uses Trainer elo directly for difficulty while normal bots still use room average', () => {
  const standardBot = buildBotIdentity({
    roomId: 'ROOM42',
    seatIndex: 1,
    players: [
      { userId: 'human-1', elo: 1000 },
      { userId: 'human-2', elo: 2000 }
    ]
  });
  const trainer = buildBotIdentity({
    roomId: 'TRN900',
    seatIndex: 1,
    players: [{ userId: 'human-1', elo: 1000 }],
    botType: BOT_TYPE_TRAINER,
    fixedElo: 9100
  });

  assert.strictEqual(getBotDifficultyElo(standardBot, [
    { userId: 'human-1', elo: 1000 },
    { userId: 'human-2', elo: 2000 },
    standardBot
  ]), 1500);
  assert.strictEqual(getBotDifficultyElo(trainer, [
    { userId: 'human-1', elo: 1000 },
    trainer
  ]), 9100);
});

test('bypasses the llm for forced gameplay moves', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for forced moves');
  };

  try {
    const decision = await chooseBotMove({
      roomId: 'FORCED1',
      kind: 'play_card',
      gameState: {
        players: [
          { userId: 'human-1', elo: 1800 },
          { userId: 'bot-1', elo: 1800, isBot: true }
        ],
        pointsByPlayer: {},
        currentTrick: []
      },
      botPlayer: {
        userId: 'bot-1',
        isBot: true,
        elo: 1800,
        rankName: 'Practising Rentz Expert'
      },
      legalMoves: [{ id: '6-S', card: '6-S' }],
      ruleset: { id: 'whist', label: 'Whist' }
    });

    assert.strictEqual(fetchCalled, false);
    assert.strictEqual(decision.source, 'forced');
    assert.strictEqual(decision.fallbackUsed, false);
    assert.strictEqual(decision.selectedMove.id, '6-S');
    assert.strictEqual(decision.debugMeta.source, 'forced');
    assert.strictEqual(decision.debugMeta.legalMoveCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('parses gameplay live index output and plain numeric repair', () => {
  const legalMoves = [
    { id: '6-S', card: '6-S' },
    { id: 'K-C', card: 'K-C' }
  ];

  const jsonDecision = parseGameplayDecisionOutput('{"i":1}', legalMoves, {
    outputContract: 'index'
  });
  assert.strictEqual(jsonDecision.success, true);
  assert.strictEqual(jsonDecision.move.id, 'K-C');
  assert.strictEqual(jsonDecision.selectedIndex, 1);

  const repairedDecision = parseGameplayDecisionOutput('0', legalMoves, {
    outputContract: 'index'
  });
  assert.strictEqual(repairedDecision.success, true);
  assert.strictEqual(repairedDecision.move.id, '6-S');
  assert.strictEqual(repairedDecision.parserMode, 'plain-number');
});

test('rejects invalid gameplay live indices with specific error codes', () => {
  const legalMoves = [
    { id: '6-S', card: '6-S' },
    { id: 'K-C', card: 'K-C' }
  ];

  assert.strictEqual(
    parseGameplayDecisionOutput('{"i":"nope"}', legalMoves, { outputContract: 'index' }).error,
    'invalid-index'
  );
  assert.strictEqual(
    parseGameplayDecisionOutput('{"i":9}', legalMoves, { outputContract: 'index' }).error,
    'index-out-of-range'
  );
  assert.strictEqual(
    parseGameplayDecisionOutput('{}', legalMoves, { outputContract: 'index' }).error,
    'empty-json'
  );
  assert.strictEqual(
    parseGameplayDecisionOutput('{"schema":{"i":"number"}}', legalMoves, { outputContract: 'index' }).error,
    'schema-output-instead-of-answer'
  );
});

test('uses gameplay and trainer model overrides for their respective runtime modes', () => {
  const originalEnv = {
    OLLAMA_GAMEPLAY_MODEL: process.env.OLLAMA_GAMEPLAY_MODEL,
    OLLAMA_TRAINER_MODEL: process.env.OLLAMA_TRAINER_MODEL,
    OLLAMA_TRAINER_FAST_MODEL: process.env.OLLAMA_TRAINER_FAST_MODEL,
    OLLAMA_TRAINER_FINAL_MODEL: process.env.OLLAMA_TRAINER_FINAL_MODEL,
    OLLAMA_TRAINER_EVAL_MODEL: process.env.OLLAMA_TRAINER_EVAL_MODEL,
    RENTZ_GAMEPLAY_BOT_NUM_PREDICT_LIVE: process.env.RENTZ_GAMEPLAY_BOT_NUM_PREDICT_LIVE
  };

  process.env.OLLAMA_GAMEPLAY_MODEL = 'llama3.2:3b';
  process.env.OLLAMA_TRAINER_MODEL = 'llama3.2:3b';
  process.env.OLLAMA_TRAINER_FAST_MODEL = 'llama3.2:3b';
  process.env.OLLAMA_TRAINER_FINAL_MODEL = 'qwen2.5:7b';
  process.env.OLLAMA_TRAINER_EVAL_MODEL = 'qwen2.5:7b';
  process.env.RENTZ_GAMEPLAY_BOT_NUM_PREDICT_LIVE = '48';

  try {
    assert.strictEqual(getGameplayBotRuntimeConfig({ mode: 'live' }).modelName, 'llama3.2:3b');
    assert.strictEqual(getGameplayBotRuntimeConfig({ mode: 'live' }).numPredict, 48);
    assert.strictEqual(getTrainerRuntimeConfig({ mode: 'fast', stage: 'after_move' }).modelName, 'llama3.2:3b');
    assert.strictEqual(getTrainerRuntimeConfig({ mode: 'fast', stage: 'final_review' }).modelName, 'qwen2.5:7b');
    assert.strictEqual(getTrainerRuntimeConfig({ mode: 'deep', stage: 'after_move' }).modelName, 'qwen2.5:7b');
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
