const request = require('supertest');

const User = require('../models/User');
const { DEFAULT_ACCOUNT_ELO } = require('../src/lib/elo');
const { getDefaultAccountImages } = require('../src/lib/accountAssets');
const { createTestApp } = require('./helpers/testApp');
const { createTestAccountPayload } = require('./helpers/builders');
const { closeTestDb, clearTestDb, connectTestDb } = require('./helpers/testDb');

const { app } = createTestApp();

describe('auth routes', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test('create account succeeds with default elo and default assets', async () => {
    const payload = createTestAccountPayload({
      description: 'Fresh challenger'
    });
    const defaultImages = getDefaultAccountImages();

    const response = await request(app)
      .post('/api/auth/register')
      .send(payload)
      .expect(201);

    expect(response.body.ok).toBe(true);
    expect(response.body.user.username).toBe(payload.username);
    expect(response.body.user.elo).toBe(DEFAULT_ACCOUNT_ELO);
    expect(response.body.user.accountCreatedAt).toBeTruthy();
    expect(response.body.user.profilePicture).toBe(defaultImages.profilePicture);
    expect(response.body.user.banner).toBe(defaultImages.banner);

    const savedUser = await User.findOne({ usernameLower: payload.username.toLowerCase() }).lean();
    expect(savedUser).toBeTruthy();
    expect(savedUser.elo).toBe(DEFAULT_ACCOUNT_ELO);
    expect(savedUser.accountCreatedAt).toBeTruthy();
  });

  test('duplicate usernames are rejected case-insensitively', async () => {
    const payload = createTestAccountPayload({
      username: 'RentzHero'
    });

    await request(app)
      .post('/api/auth/register')
      .send(payload)
      .expect(201);

    const duplicateResponse = await request(app)
      .post('/api/auth/register')
      .send({
        ...createTestAccountPayload(),
        username: 'rentzhero'
      })
      .expect(409);

    expect(duplicateResponse.body.error).toBe('Username is already taken');
    expect(await User.countDocuments({ usernameLower: 'rentzhero' })).toBe(1);
  });

  test('login succeeds with the right password and fails with the wrong one', async () => {
    const payload = createTestAccountPayload({
      username: 'LoginPilot'
    });

    await request(app)
      .post('/api/auth/register')
      .send(payload)
      .expect(201);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: payload.username,
        password: payload.password
      })
      .expect(200);

    expect(loginResponse.body.ok).toBe(true);
    expect(loginResponse.body.user.username).toBe(payload.username);
    expect(loginResponse.headers['set-cookie']).toBeTruthy();

    const wrongPasswordResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: payload.username,
        password: 'DefinitelyWrong123'
      })
      .expect(401);

    expect(wrongPasswordResponse.body.error).toBe('Invalid username or password');
  });

  test('forgot-password does not leak whether an account exists', async () => {
    const payload = createTestAccountPayload({
      username: 'Resettable'
    });

    await request(app)
      .post('/api/auth/register')
      .send(payload)
      .expect(201);

    const existingResponse = await request(app)
      .post('/api/auth/forgot-password')
      .send({ username: payload.username })
      .expect(200);
    const missingResponse = await request(app)
      .post('/api/auth/forgot-password')
      .send({ username: 'NotARealAccount' })
      .expect(200);

    expect(existingResponse.body).toEqual(missingResponse.body);

    const savedUser = await User.findOne({ usernameLower: payload.username.toLowerCase() }).lean();
    expect(savedUser.passwordResetRequestedAt).toBeTruthy();
  });

  test('authenticated users can update their description through /me', async () => {
    const agent = request.agent(app);
    const payload = createTestAccountPayload({
      username: 'PatchMe'
    });

    await agent
      .post('/api/auth/register')
      .send(payload)
      .expect(201);

    const patchResponse = await agent
      .patch('/api/auth/me')
      .send({
        description: 'Updated profile blurb'
      })
      .expect(200);

    expect(patchResponse.body.user.description).toBe('Updated profile blurb');

    const savedUser = await User.findOne({ usernameLower: payload.username.toLowerCase() }).lean();
    expect(savedUser.description).toBe('Updated profile blurb');
  });
});
