const test = require('node:test');
const assert = require('node:assert');

const {
  buildFriendshipStatus,
  normalizeRelationshipIds
} = require('../src/lib/friends');

test('normalizes relationship id lists by removing duplicates and blanks', () => {
  assert.deepStrictEqual(
    normalizeRelationshipIds([
      '507f1f77bcf86cd799439011',
      '',
      '507f1f77bcf86cd799439011',
      { userId: '507f191e810c19729de860ea' }
    ]),
    ['507f1f77bcf86cd799439011', '507f191e810c19729de860ea']
  );
});

test('derives friend relationship states for accounts and guests', () => {
  const viewer = {
    userId: '507f191e810c19729de860aa',
    guest: false,
    friends: ['507f191e810c19729de860ab'],
    incomingFriendRequests: ['507f191e810c19729de860ac'],
    outgoingFriendRequests: ['507f191e810c19729de860ad']
  };

  assert.strictEqual(buildFriendshipStatus(null, { userId: '507f191e810c19729de860ae' }).code, 'login-required');
  assert.strictEqual(buildFriendshipStatus(viewer, { userId: '507f191e810c19729de860aa' }).code, 'self');
  assert.strictEqual(buildFriendshipStatus(viewer, { userId: '507f191e810c19729de860ab' }).code, 'friends');
  assert.strictEqual(buildFriendshipStatus(viewer, { userId: '507f191e810c19729de860ac' }).code, 'incoming-pending');
  assert.strictEqual(buildFriendshipStatus(viewer, { userId: '507f191e810c19729de860ad' }).code, 'outgoing-pending');
  assert.strictEqual(buildFriendshipStatus(viewer, { userId: '507f191e810c19729de860af', guest: true }).code, 'guest-user');
  assert.strictEqual(buildFriendshipStatus(viewer, { userId: '507f191e810c19729de860b0' }).code, 'not-friends');
});
