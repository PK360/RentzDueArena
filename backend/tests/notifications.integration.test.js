const request = require('supertest');

const Notification = require('../models/Notification');
const User = require('../models/User');
const { createTestApp } = require('./helpers/testApp');
const { createTestAccountPayload } = require('./helpers/builders');
const { closeTestDb, clearTestDb, connectTestDb } = require('./helpers/testDb');

const { app } = createTestApp();

async function registerUser(agent, overrides = {}) {
  const payload = createTestAccountPayload(overrides);
  const response = await agent
    .post('/api/auth/register')
    .send(payload)
    .expect(201);

  return response.body.user;
}

describe('friend request notifications', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('sending and accepting a friend request creates a notification and friendship', async () => {
    const senderAgent = request.agent(app);
    const receiverAgent = request.agent(app);
    const sender = await registerUser(senderAgent, { username: 'FriendSender' });
    const receiver = await registerUser(receiverAgent, { username: 'FriendReceiver' });

    const requestResponse = await senderAgent
      .post('/api/auth/friends/request')
      .send({ targetUserId: receiver.id })
      .expect(200);

    expect(requestResponse.body.ok).toBe(true);

    const pendingNotifications = await Notification.find({ recipientUserId: receiver.id }).lean();
    expect(pendingNotifications).toHaveLength(1);
    expect(pendingNotifications[0].type).toBe('friend_request');
    expect(pendingNotifications[0].actionState).toBe('pending');

    await receiverAgent
      .post('/api/auth/friends/accept')
      .send({ targetUserId: sender.id })
      .expect(200);

    const [savedSender, savedReceiver, resolvedNotification] = await Promise.all([
      User.findById(sender.id).lean(),
      User.findById(receiver.id).lean(),
      Notification.findOne({ recipientUserId: receiver.id }).lean()
    ]);

    expect(savedSender.friends.map((value) => String(value))).toContain(receiver.id);
    expect(savedReceiver.friends.map((value) => String(value))).toContain(sender.id);
    expect(resolvedNotification.actionState).toBe('accepted');
  });
});
