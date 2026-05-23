const assert = require('node:assert');

const {
  buildForumThread,
  normalizeForumSearchQuery,
  normalizeObjectIdArray,
  serializeForumPost
} = require('../src/lib/forum');
const {
  normalizeRulesetRatingValue
} = require('../src/lib/customRulesets');

test('normalizes forum object-id arrays by removing duplicates and invalid values', () => {
  assert.deepStrictEqual(
    normalizeObjectIdArray([
      '507f1f77bcf86cd799439011',
      '',
      '507f1f77bcf86cd799439011',
      { _id: '507f191e810c19729de860ea' },
      'not-an-object-id'
    ]),
    ['507f1f77bcf86cd799439011', '507f191e810c19729de860ea']
  );
});

test('sorts root forum posts with friends first and nests replies in chronological order', () => {
  const viewer = {
    friends: ['507f191e810c19729de860aa']
  };
  const rootPosts = [
    {
      _id: '507f191e810c19729de86001',
      author: { _id: '507f191e810c19729de860bb', username: 'stranger' },
      text: 'new stranger post',
      createdAt: new Date('2025-01-03T10:00:00.000Z')
    },
    {
      _id: '507f191e810c19729de86002',
      author: { _id: '507f191e810c19729de860aa', username: 'friend' },
      text: 'older friend post',
      createdAt: new Date('2025-01-01T10:00:00.000Z')
    }
  ];
  const replyPosts = [
    {
      _id: '507f191e810c19729de86003',
      parentPost: '507f191e810c19729de86002',
      rootPost: '507f191e810c19729de86002',
      author: { _id: '507f191e810c19729de860bb', username: 'stranger' },
      text: 'later reply',
      createdAt: new Date('2025-01-02T10:00:00.000Z')
    },
    {
      _id: '507f191e810c19729de86004',
      parentPost: '507f191e810c19729de86002',
      rootPost: '507f191e810c19729de86002',
      author: { _id: '507f191e810c19729de860aa', username: 'friend' },
      text: 'earlier reply',
      createdAt: new Date('2025-01-01T11:00:00.000Z')
    }
  ];

  const thread = buildForumThread(rootPosts, replyPosts, viewer);

  assert.strictEqual(thread[0].author.username, 'friend');
  assert.strictEqual(thread[1].author.username, 'stranger');
  assert.deepStrictEqual(
    thread[0].replies.map((reply) => reply.text),
    ['earlier reply', 'later reply']
  );
});

test('normalizes forum search queries and supports half-star ruleset ratings', () => {
  assert.strictEqual(normalizeForumSearchQuery('   hearts   total   '), 'hearts total');
  assert.strictEqual(normalizeRulesetRatingValue(3.5), 3.5);
  assert.strictEqual(normalizeRulesetRatingValue(3.74), 3.5);
  assert.throws(() => normalizeRulesetRatingValue(0), /between 0.5 and 5 stars/);
});

test('serializes deleted forum posts with an explicit deleted flag', () => {
  const serialized = serializeForumPost({
    _id: '507f191e810c19729de86077',
    author: { _id: '507f191e810c19729de86088', username: 'author' },
    text: '',
    deletedAt: new Date('2025-01-02T10:00:00.000Z')
  }, null);

  assert.strictEqual(serialized.isDeleted, true);
  assert.ok(serialized.deletedAt);
});
