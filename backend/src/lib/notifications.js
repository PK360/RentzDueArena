const mongoose = require('mongoose');

const Notification = require('../../models/Notification');
const User = require('../../models/User');

const NOTIFICATION_CATEGORY_BY_TYPE = Object.freeze({
  friend_request: 'friend_requests',
  game_invite: 'game_invites',
  resume_rejoin: 'game_invites',
  forum_comment: 'forum',
  forum_rating: 'forum'
});

const DEFAULT_NOTIFICATION_LIMIT = 60;

function getNotificationSocketRoom(userId) {
  return `account:${String(userId || '').trim()}:notifications`;
}

function getNotificationCategory(type) {
  return NOTIFICATION_CATEGORY_BY_TYPE[type] || 'forum';
}

function buildNotificationActor(actor = null) {
  if (!actor) {
    return {
      userId: '',
      username: '',
      avatarUrl: ''
    };
  }

  return {
    userId: String(actor.userId || actor._id || actor.id || ''),
    username: String(actor.username || actor.displayName || actor.name || ''),
    avatarUrl: String(actor.avatarUrl || actor.profilePicture || '')
  };
}

function normalizeForumThreadId(value) {
  if (!value) {
    return '';
  }

  return String(value._id || value.id || value);
}

async function getRecipientNotificationSettings(recipientUserId) {
  const normalizedRecipientUserId = String(recipientUserId || '').trim();
  if (!mongoose.isValidObjectId(normalizedRecipientUserId)) {
    return null;
  }

  return User.findById(normalizedRecipientUserId)
    .select('muteAllNotifications mutedForumThreadNotificationIds')
    .lean();
}

async function shouldSkipNotificationCreation(recipientUserId, {
  actorUserId = '',
  forumThreadId = ''
} = {}) {
  const normalizedRecipientUserId = String(recipientUserId || '').trim();
  const normalizedActorUserId = String(actorUserId || '').trim();

  if (!normalizedRecipientUserId || !mongoose.isValidObjectId(normalizedRecipientUserId)) {
    return true;
  }

  if (normalizedActorUserId && normalizedActorUserId === normalizedRecipientUserId) {
    return true;
  }

  const recipient = await getRecipientNotificationSettings(normalizedRecipientUserId);
  if (!recipient) {
    return true;
  }

  if (recipient.muteAllNotifications) {
    return true;
  }

  const normalizedForumThreadId = normalizeForumThreadId(forumThreadId);
  if (
    normalizedForumThreadId
    && Array.isArray(recipient.mutedForumThreadNotificationIds)
    && recipient.mutedForumThreadNotificationIds.some((value) => String(value) === normalizedForumThreadId)
  ) {
    return true;
  }

  return false;
}

function serializeNotification(notification) {
  if (!notification) {
    return null;
  }

  return {
    id: String(notification._id),
    recipientUserId: String(notification.recipientUserId || ''),
    type: notification.type,
    category: notification.category || getNotificationCategory(notification.type),
    createdAt: notification.createdAt || null,
    updatedAt: notification.updatedAt || null,
    read: Boolean(notification.readAt),
    readAt: notification.readAt || null,
    actionState: notification.actionState || 'pending',
    actor: notification.actor || { userId: '', username: '', avatarUrl: '' },
    entity: notification.entity || {},
    redirect: notification.redirect || null,
    display: notification.display || {}
  };
}

async function listNotificationsForUser(recipientUserId, { limit = DEFAULT_NOTIFICATION_LIMIT } = {}) {
  const normalizedRecipientUserId = String(recipientUserId || '').trim();
  if (!mongoose.isValidObjectId(normalizedRecipientUserId)) {
    return {
      notifications: [],
      unreadCount: 0
    };
  }

  const normalizedLimit = Math.max(1, Math.min(DEFAULT_NOTIFICATION_LIMIT, Number(limit || DEFAULT_NOTIFICATION_LIMIT)));
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ recipientUserId: normalizedRecipientUserId })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(normalizedLimit)
      .lean(),
    Notification.countDocuments({
      recipientUserId: normalizedRecipientUserId,
      readAt: null
    })
  ]);

  return {
    notifications: notifications.map((notification) => serializeNotification(notification)).filter(Boolean),
    unreadCount
  };
}

async function emitNotificationSnapshot(io, recipientUserId, { limit = DEFAULT_NOTIFICATION_LIMIT } = {}) {
  if (!io || !recipientUserId) {
    return null;
  }

  const payload = await listNotificationsForUser(recipientUserId, { limit });
  io.to(getNotificationSocketRoom(recipientUserId)).emit('notifications_snapshot', payload);
  return payload;
}

async function createNotification(io, {
  recipientUserId,
  type,
  dedupeKey,
  actor = null,
  entity = {},
  redirect = null,
  display = {},
  actionState = 'pending',
  forumThreadId = ''
} = {}) {
  const normalizedRecipientUserId = String(recipientUserId || '').trim();
  if (!normalizedRecipientUserId || !type || !dedupeKey) {
    return null;
  }

  const safeActor = buildNotificationActor(actor);
  const skip = await shouldSkipNotificationCreation(normalizedRecipientUserId, {
    actorUserId: safeActor.userId,
    forumThreadId
  });
  if (skip) {
    return null;
  }

  const notification = await Notification.findOneAndUpdate(
    {
      recipientUserId: normalizedRecipientUserId,
      dedupeKey: String(dedupeKey).trim()
    },
    {
      $set: {
        type,
        category: getNotificationCategory(type),
        actor: safeActor,
        entity,
        redirect,
        display,
        actionState,
        readAt: null
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  await emitNotificationSnapshot(io, normalizedRecipientUserId);
  return notification;
}

async function updateNotifications(recipientUserId, filter = {}, update = {}, io = null) {
  const normalizedRecipientUserId = String(recipientUserId || '').trim();
  if (!mongoose.isValidObjectId(normalizedRecipientUserId)) {
    return 0;
  }

  const result = await Notification.updateMany(
    {
      recipientUserId: normalizedRecipientUserId,
      ...filter
    },
    update
  );

  if (result.modifiedCount > 0 && io) {
    await emitNotificationSnapshot(io, normalizedRecipientUserId);
  }

  return result.modifiedCount;
}

async function markNotificationsRead(recipientUserId, notificationIds = [], io = null) {
  const normalizedNotificationIds = (Array.isArray(notificationIds) ? notificationIds : [])
    .map((value) => String(value || '').trim())
    .filter((value) => mongoose.isValidObjectId(value));

  if (normalizedNotificationIds.length === 0) {
    return 0;
  }

  return updateNotifications(
    recipientUserId,
    { _id: { $in: normalizedNotificationIds }, readAt: null },
    { $set: { readAt: new Date() } },
    io
  );
}

async function markAllNotificationsRead(recipientUserId, io = null) {
  return updateNotifications(
    recipientUserId,
    { readAt: null },
    { $set: { readAt: new Date() } },
    io
  );
}

module.exports = {
  DEFAULT_NOTIFICATION_LIMIT,
  createNotification,
  emitNotificationSnapshot,
  getNotificationCategory,
  getNotificationSocketRoom,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationsRead,
  serializeNotification,
  updateNotifications
};
