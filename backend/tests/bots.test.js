const test = require('node:test');
const assert = require('node:assert');

const {
  BOT_TYPE_TRAINER,
  buildBotIdentity,
  chooseFallbackMove,
  getAverageHumanElo,
  getBotDifficultyElo,
  getNextBotOrdinal
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
