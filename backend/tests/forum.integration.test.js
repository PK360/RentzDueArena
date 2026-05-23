const request = require('supertest');

const ForumPost = require('../models/ForumPost');
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

describe('forum routes', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('like toggles never duplicate and thread replies remain available', async () => {
    const authorAgent = request.agent(app);
    const readerAgent = request.agent(app);
    const author = await registerUser(authorAgent, { username: 'ThreadAuthor' });
    void author;
    await registerUser(readerAgent, { username: 'ThreadReader' });

    const postResponse = await authorAgent
      .post('/api/forum/posts')
      .send({ text: 'Root forum post' })
      .expect(201);
    const postId = postResponse.body.post.id;

    await readerAgent
      .post('/api/forum/posts')
      .send({
        parentPostId: postId,
        text: 'Still here after likes'
      })
      .expect(201);

    await readerAgent
      .post(`/api/forum/posts/${postId}/like`)
      .send({})
      .expect(200);
    let savedPost = await ForumPost.findById(postId).lean();
    expect(savedPost.likedBy).toHaveLength(1);

    await readerAgent
      .post(`/api/forum/posts/${postId}/like`)
      .send({})
      .expect(200);
    savedPost = await ForumPost.findById(postId).lean();
    expect(savedPost.likedBy).toHaveLength(0);

    await readerAgent
      .post(`/api/forum/posts/${postId}/like`)
      .send({})
      .expect(200);
    savedPost = await ForumPost.findById(postId).lean();
    expect(savedPost.likedBy).toHaveLength(1);

    const threadResponse = await readerAgent
      .get(`/api/forum/posts/${postId}/thread`)
      .expect(200);

    expect(threadResponse.body.thread.selected.id).toBe(postId);
    expect(threadResponse.body.thread.selected.replies).toHaveLength(1);
    expect(threadResponse.body.thread.selected.replies[0].text).toBe('Still here after likes');
  });

  test('forum comments create notifications unless the thread is muted', async () => {
    const authorAgent = request.agent(app);
    const commenterAgent = request.agent(app);
    const author = await registerUser(authorAgent, { username: 'NotifyAuthor' });
    await registerUser(commenterAgent, { username: 'NotifyCommenter' });

    const postResponse = await authorAgent
      .post('/api/forum/posts')
      .send({ text: 'Notification target post' })
      .expect(201);
    const postId = postResponse.body.post.id;

    await commenterAgent
      .post('/api/forum/posts')
      .send({
        parentPostId: postId,
        text: 'First reply should notify'
      })
      .expect(201);

    let notifications = await Notification.find({ recipientUserId: author.id }).lean();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('forum_comment');

    await authorAgent
      .post(`/api/forum/posts/${postId}/mute-notifications`)
      .send({})
      .expect(200);

    await commenterAgent
      .post('/api/forum/posts')
      .send({
        parentPostId: postId,
        text: 'Second reply should stay muted'
      })
      .expect(201);

    notifications = await Notification.find({ recipientUserId: author.id }).lean();
    expect(notifications).toHaveLength(1);

    const mutedAuthor = await User.findById(author.id).lean();
    expect(
      mutedAuthor.mutedForumThreadNotificationIds.map((value) => String(value))
    ).toContain(postId);
  });
});
