const express = require('express');
const mongoose = require('mongoose');

const User = require('../../models/User');
const { emitFriendStateUpdate } = require('../../socketManager');
const { generateFriendCode } = require('../../utils/helpers');
const {
  ACCOUNT_RULESET_OPTIONS,
  MAX_FAVOURITE_RULESETS,
  MAX_RULESET_LOADOUT,
  getRulesetDefinitionByIndex,
  normalizeRulesetIndexes
} = require('../lib/accountRulesets');
const {
  getDefaultAccountImages,
  saveUploadedAccountImage
} = require('../lib/accountAssets');
const {
  buildFriendStatePayload,
  buildProfileSummary,
  normalizeRelationshipIds,
  sanitizeRelationshipReferences
} = require('../lib/friends');
const {
  buildCompetitiveSummaryForUser,
  getRankLeaderboardForUser,
  getRankLeaderboardForUserId
} = require('../lib/elo');
const {
  createNotification,
  emitNotificationSnapshot,
  updateNotifications
} = require('../lib/notifications');
const {
  clearSessionCookie,
  getAuthenticatedUserFromRequest,
  hashPassword,
  persistSession,
  serializeAccount,
  verifyPassword
} = require('../lib/auth');

const router = express.Router();

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function readUsername(value) {
  return String(value || '').trim();
}

function readPassword(value) {
  return String(value || '');
}

function validatePassword(password) {
  if (!password) {
    return 'Password is required';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or less`;
  }

  return null;
}

function readTargetUserId(value) {
  return String(value || '').trim();
}

function isValidTargetUserId(value) {
  return mongoose.isValidObjectId(value);
}

function addRelationshipId(user, fieldName, targetUserId) {
  user[fieldName] = [
    ...normalizeRelationshipIds(user[fieldName], String(user?._id || '')),
    targetUserId
  ];
}

function removeRelationshipId(user, fieldName, targetUserId) {
  user[fieldName] = normalizeRelationshipIds(user[fieldName], String(user?._id || ''))
    .filter((value) => value !== targetUserId);
}

async function requireAuthenticatedAccount(req, res, message = 'You must be logged in to use this feature') {
  const user = await getAuthenticatedUserFromRequest(req);

  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: message });
    return null;
  }

  return user;
}

async function syncFriendStateForUsers(req, users) {
  const io = req.app.get('io');

  if (!io) {
    return;
  }

  await Promise.all(
    users
      .filter(Boolean)
      .map((user) => emitFriendStateUpdate(io, user))
  );
}

async function serializeAuthenticatedAccount(user) {
  if (!user) {
    return null;
  }

  return {
    ...serializeAccount(user),
    ...(await buildCompetitiveSummaryForUser(user))
  };
}

async function buildFriendActionResponse(user, targetUser, message) {
  return {
    ok: true,
    message,
    user: await serializeAuthenticatedAccount(user),
    friendState: await buildFriendStatePayload(user),
    profile: await buildProfileSummary(targetUser, user)
  };
}

function normalizeAccountPayload(body = {}) {
  return {
    username: readUsername(body.username),
    password: readPassword(body.password),
    profilePictureUpload: body.profilePictureUpload || null,
    bannerUpload: body.bannerUpload || null,
    description: readProfileField(body.description),
    favouriteRulesets: normalizeRulesetIndexes(body.favouriteRulesets, {
      maxItems: MAX_FAVOURITE_RULESETS,
      fieldName: 'favouriteRulesets'
    }),
    rulesetLoadout: normalizeRulesetIndexes(body.rulesetLoadout, {
      maxItems: MAX_RULESET_LOADOUT,
      fieldName: 'rulesetLoadout'
    })
  };
}

function normalizeAccountUpdatePayload(body = {}) {
  const hasField = (fieldName) => Object.prototype.hasOwnProperty.call(body, fieldName);
  const payload = {};

  if (hasField('username')) {
    payload.username = readUsername(body.username);
  }

  if (hasField('description')) {
    payload.description = readProfileField(body.description);
  }

  if (hasField('profilePictureUpload')) {
    payload.profilePictureUpload = body.profilePictureUpload || null;
  }

  if (hasField('bannerUpload')) {
    payload.bannerUpload = body.bannerUpload || null;
  }

  if (hasField('favouriteRulesets')) {
    payload.favouriteRulesets = normalizeRulesetIndexes(body.favouriteRulesets, {
      maxItems: MAX_FAVOURITE_RULESETS,
      fieldName: 'favouriteRulesets'
    });
  }

  if (hasField('rulesetLoadout')) {
    payload.rulesetLoadout = normalizeRulesetIndexes(body.rulesetLoadout, {
      maxItems: MAX_RULESET_LOADOUT,
      fieldName: 'rulesetLoadout'
    });
  }

  if (hasField('muteAllNotifications')) {
    payload.muteAllNotifications = Boolean(body.muteAllNotifications);
  }

  return payload;
}

function mapUserValidationError(error) {
  if (!error) {
    return null;
  }

  if (error.code === 11000) {
    const duplicateFields = Object.keys(error.keyPattern || {});

    if (duplicateFields.includes('usernameLower') || duplicateFields.includes('username')) {
      return {
        statusCode: 409,
        clientMessage: 'Username is already taken'
      };
    }

    if (duplicateFields.includes('friendCode')) {
      return {
        statusCode: 503,
        clientMessage: 'Unable to allocate a unique friend code right now. Please try again.'
      };
    }

    console.error('Unexpected duplicate-key error while saving user account:', {
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue
    });

    return {
      statusCode: 500,
      clientMessage: 'Account registration failed because of a database constraint issue.'
    };
  }

  if (error.name === 'ValidationError') {
    return {
      statusCode: 400,
      clientMessage: Object.values(error.errors)[0]?.message || 'Invalid account details'
    };
  }

  return null;
}

router.post('/register', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = normalizeAccountPayload(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Invalid account details' });
    }

    const passwordError = validatePassword(payload.password);

    if (!payload.username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const defaultImages = getDefaultAccountImages();
    const profilePicture = await saveUploadedAccountImage(
      payload.profilePictureUpload,
      'profile',
      'Profile picture'
    ) || defaultImages.profilePicture;
    const banner = await saveUploadedAccountImage(
      payload.bannerUpload,
      'banner',
      'Banner'
    ) || defaultImages.banner;

    const user = new User({
      username: payload.username,
      passwordHash: await hashPassword(payload.password),
      profilePicture,
      banner,
      description: payload.description,
      favouriteRulesets: payload.favouriteRulesets,
      rulesetLoadout: payload.rulesetLoadout,
      friendCode: await generateFriendCode(User)
    });

    await user.save();
    await persistSession(res, user);

    res.status(201).json({
      ok: true,
      user: await serializeAuthenticatedAccount(user)
    });
  } catch (error) {
    const mappedError = mapUserValidationError(error);
    if (mappedError) {
      return res.status(mappedError.statusCode).json({ error: mappedError.clientMessage });
    }

    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const username = readUsername(req.body.username);
    const password = readPassword(req.body.password);

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ usernameLower: username.toLowerCase() });
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    await persistSession(res, user);

    res.json({
      ok: true,
      user: await serializeAuthenticatedAccount(user)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const user = await getAuthenticatedUserFromRequest(req);

    if (user) {
      user.sessionVersion = Number(user.sessionVersion || 0) + 1;
      await user.save();
    }

    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await getAuthenticatedUserFromRequest(req);

    if (!user) {
      clearSessionCookie(res);
      return res.json({
        ok: true,
        authenticated: false,
        user: null
      });
    }

    res.json({
      ok: true,
      authenticated: true,
      user: await serializeAuthenticatedAccount(user)
    });
  } catch (error) {
    clearSessionCookie(res);
    next(error);
  }
});

router.patch('/me', async (req, res, next) => {
  try {
    const user = await getAuthenticatedUserFromRequest(req);

    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'You must be logged in to edit this account' });
    }

    let payload;
    try {
      payload = normalizeAccountUpdatePayload(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Invalid account details' });
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'username') && !payload.username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'username')) {
      user.username = payload.username;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
      user.description = payload.description;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'favouriteRulesets')) {
      user.favouriteRulesets = payload.favouriteRulesets;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'rulesetLoadout')) {
      user.rulesetLoadout = payload.rulesetLoadout;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'muteAllNotifications')) {
      user.muteAllNotifications = Boolean(payload.muteAllNotifications);
    }

    if (payload.profilePictureUpload) {
      user.profilePicture = await saveUploadedAccountImage(
        payload.profilePictureUpload,
        'profile',
        'Profile picture'
      ) || user.profilePicture;
    }

    if (payload.bannerUpload) {
      user.banner = await saveUploadedAccountImage(
        payload.bannerUpload,
        'banner',
        'Banner'
      ) || user.banner;
    }

    await persistSession(res, user);

    res.json({
      ok: true,
      user: await serializeAuthenticatedAccount(user)
    });
  } catch (error) {
    const mappedError = mapUserValidationError(error);
    if (mappedError) {
      return res.status(mappedError.statusCode).json({ error: mappedError.clientMessage });
    }

    next(error);
  }
});

router.get('/profiles/:userId', async (req, res, next) => {
  try {
    const viewer = await getAuthenticatedUserFromRequest(req);
    if (viewer) {
      await sanitizeRelationshipReferences(viewer);
    }

    const targetUserId = readTargetUserId(req.params.userId);
    if (!targetUserId) {
      return res.status(400).json({ error: 'Profile target is required' });
    }

    if (!isValidTargetUserId(targetUserId)) {
      return res.status(400).json({ error: 'Invalid profile target' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      ok: true,
      profile: await buildProfileSummary(targetUser, viewer)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/friends/state', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(
      req,
      res,
      'You must be logged in to view friend requests'
    );

    if (!user) {
      return;
    }

    await sanitizeRelationshipReferences(user);

    res.json({
      ok: true,
      user: await serializeAuthenticatedAccount(user),
      friendState: await buildFriendStatePayload(user)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/friends/request', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(
      req,
      res,
      'You must be logged in to send a friend request'
    );

    if (!user) {
      return;
    }

    await sanitizeRelationshipReferences(user);

    const targetUserId = readTargetUserId(req.body.targetUserId);
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user is required' });
    }

    if (!isValidTargetUserId(targetUserId)) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    if (String(user._id) === targetUserId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    await sanitizeRelationshipReferences(targetUser);

    const friendIds = new Set(normalizeRelationshipIds(user.friends, String(user._id)));
    const incomingIds = new Set(normalizeRelationshipIds(user.incomingFriendRequests, String(user._id)));
    const outgoingIds = new Set(normalizeRelationshipIds(user.outgoingFriendRequests, String(user._id)));

    if (friendIds.has(targetUserId)) {
      return res.status(409).json({ error: 'You are already friends with this player' });
    }

    if (outgoingIds.has(targetUserId)) {
      return res.status(409).json({ error: 'Friend request already sent' });
    }

    if (incomingIds.has(targetUserId)) {
      return res.status(409).json({ error: 'This player has already sent you a friend request' });
    }

    addRelationshipId(user, 'outgoingFriendRequests', targetUserId);
    addRelationshipId(targetUser, 'incomingFriendRequests', String(user._id));

    await user.save();
    await targetUser.save();
    await syncFriendStateForUsers(req, [user, targetUser]);
    await createNotification(req.app.get('io'), {
      recipientUserId: targetUser._id,
      type: 'friend_request',
      dedupeKey: `friend_request:${targetUserId}:${String(user._id)}`,
      actor: user,
      entity: {
        friendUserId: String(user._id)
      },
      display: {
        title: 'Incoming friend request',
        body: `${user.username} sent you a friend request.`
      }
    });

    res.json(await buildFriendActionResponse(user, targetUser, 'Friend request sent.'));
  } catch (error) {
    next(error);
  }
});

router.post('/friends/accept', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(
      req,
      res,
      'You must be logged in to accept a friend request'
    );

    if (!user) {
      return;
    }

    await sanitizeRelationshipReferences(user);

    const targetUserId = readTargetUserId(req.body.targetUserId);
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user is required' });
    }

    if (!isValidTargetUserId(targetUserId)) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    await sanitizeRelationshipReferences(targetUser);

    const incomingIds = new Set(normalizeRelationshipIds(user.incomingFriendRequests, String(user._id)));
    if (!incomingIds.has(targetUserId)) {
      return res.status(409).json({ error: 'No incoming friend request from this player' });
    }

    removeRelationshipId(user, 'incomingFriendRequests', targetUserId);
    removeRelationshipId(user, 'outgoingFriendRequests', targetUserId);
    addRelationshipId(user, 'friends', targetUserId);

    removeRelationshipId(targetUser, 'outgoingFriendRequests', String(user._id));
    removeRelationshipId(targetUser, 'incomingFriendRequests', String(user._id));
    addRelationshipId(targetUser, 'friends', String(user._id));

    await user.save();
    await targetUser.save();
    await syncFriendStateForUsers(req, [user, targetUser]);
    await updateNotifications(
      user._id,
      {
        type: 'friend_request',
        'entity.friendUserId': targetUserId
      },
      {
        $set: {
          actionState: 'accepted',
          readAt: new Date()
        }
      },
      req.app.get('io')
    );
    await emitNotificationSnapshot(req.app.get('io'), targetUser._id);

    res.json(await buildFriendActionResponse(user, targetUser, 'Friend request accepted.'));
  } catch (error) {
    next(error);
  }
});

router.post('/friends/reject', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(
      req,
      res,
      'You must be logged in to reject a friend request'
    );

    if (!user) {
      return;
    }

    await sanitizeRelationshipReferences(user);

    const targetUserId = readTargetUserId(req.body.targetUserId);
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user is required' });
    }

    if (!isValidTargetUserId(targetUserId)) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    await sanitizeRelationshipReferences(targetUser);

    const incomingIds = new Set(normalizeRelationshipIds(user.incomingFriendRequests, String(user._id)));
    if (!incomingIds.has(targetUserId)) {
      return res.status(409).json({ error: 'No incoming friend request from this player' });
    }

    removeRelationshipId(user, 'incomingFriendRequests', targetUserId);
    removeRelationshipId(targetUser, 'outgoingFriendRequests', String(user._id));

    await user.save();
    await targetUser.save();
    await syncFriendStateForUsers(req, [user, targetUser]);
    await updateNotifications(
      user._id,
      {
        type: 'friend_request',
        'entity.friendUserId': targetUserId
      },
      {
        $set: {
          actionState: 'declined',
          readAt: new Date()
        }
      },
      req.app.get('io')
    );
    await emitNotificationSnapshot(req.app.get('io'), targetUser._id);

    res.json(await buildFriendActionResponse(user, targetUser, 'Friend request rejected.'));
  } catch (error) {
    next(error);
  }
});

router.post('/friends/remove', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(
      req,
      res,
      'You must be logged in to remove a friend'
    );

    if (!user) {
      return;
    }

    await sanitizeRelationshipReferences(user);

    const targetUserId = readTargetUserId(req.body.targetUserId);
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user is required' });
    }

    if (!isValidTargetUserId(targetUserId)) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    await sanitizeRelationshipReferences(targetUser);

    const friendIds = new Set(normalizeRelationshipIds(user.friends, String(user._id)));
    if (!friendIds.has(targetUserId)) {
      return res.status(409).json({ error: 'You are not friends with this player' });
    }

    removeRelationshipId(user, 'friends', targetUserId);
    removeRelationshipId(user, 'incomingFriendRequests', targetUserId);
    removeRelationshipId(user, 'outgoingFriendRequests', targetUserId);

    removeRelationshipId(targetUser, 'friends', String(user._id));
    removeRelationshipId(targetUser, 'incomingFriendRequests', String(user._id));
    removeRelationshipId(targetUser, 'outgoingFriendRequests', String(user._id));

    await user.save();
    await targetUser.save();
    await syncFriendStateForUsers(req, [user, targetUser]);

    res.json(await buildFriendActionResponse(user, targetUser, 'Friend removed.'));
  } catch (error) {
    next(error);
  }
});

router.post('/friends/cancel', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(
      req,
      res,
      'You must be logged in to cancel a friend request'
    );

    if (!user) {
      return;
    }

    await sanitizeRelationshipReferences(user);

    const targetUserId = readTargetUserId(req.body.targetUserId);
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user is required' });
    }

    if (!isValidTargetUserId(targetUserId)) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    await sanitizeRelationshipReferences(targetUser);

    const outgoingIds = new Set(normalizeRelationshipIds(user.outgoingFriendRequests, String(user._id)));
    if (!outgoingIds.has(targetUserId)) {
      return res.status(409).json({ error: 'No outgoing friend request to cancel' });
    }

    removeRelationshipId(user, 'outgoingFriendRequests', targetUserId);
    removeRelationshipId(targetUser, 'incomingFriendRequests', String(user._id));

    await user.save();
    await targetUser.save();
    await syncFriendStateForUsers(req, [user, targetUser]);
    await updateNotifications(
      targetUser._id,
      {
        type: 'friend_request',
        'entity.friendUserId': String(user._id)
      },
      {
        $set: {
          actionState: 'resolved',
          readAt: new Date()
        }
      },
      req.app.get('io')
    );
    await emitNotificationSnapshot(req.app.get('io'), user._id);

    res.json(await buildFriendActionResponse(user, targetUser, 'Friend request canceled.'));
  } catch (error) {
    next(error);
  }
});

router.get('/account-rulesets', async (req, res, next) => {
  try {
    res.json({
      ok: true,
      rulesets: ACCOUNT_RULESET_OPTIONS.map((option) => {
        const definition = getRulesetDefinitionByIndex(option.index);

        return {
          index: option.index,
          id: option.id,
          label: option.label,
          abbreviation: option.abbreviation,
          type: definition?.type || 'per_round',
          code: definition?.code || ''
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

router.get('/leaderboard/current-rank', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(
      req,
      res,
      'You must be logged in to view your rank leaderboard'
    );

    if (!user) {
      return;
    }

    res.json({
      ok: true,
      leaderboard: await getRankLeaderboardForUser(user)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/leaderboard/rank/:userId', async (req, res, next) => {
  try {
    const viewer = await getAuthenticatedUserFromRequest(req);
    const targetUserId = readTargetUserId(req.params.userId);

    if (!targetUserId) {
      return res.status(400).json({ error: 'Profile target is required' });
    }

    if (!isValidTargetUserId(targetUserId)) {
      return res.status(400).json({ error: 'Invalid profile target' });
    }

    const leaderboard = await getRankLeaderboardForUserId(targetUserId, { viewer });
    if (!leaderboard) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      ok: true,
      leaderboard
    });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const username = readUsername(req.body.username);

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const user = await User.findOne({ usernameLower: username.toLowerCase() });
    if (user) {
      user.passwordResetRequestedAt = new Date();
      await user.save();
    }

    res.json({
      ok: true,
      placeholder: true,
      message: 'Password reset email delivery is not configured yet. A reset request has been recorded for future integration.'
    });
  } catch (error) {
    next(error);
  }
});

function readProfileField(value) {
  return String(value || '').trim();
}

module.exports = router;
