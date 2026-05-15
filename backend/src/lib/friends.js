const mongoose = require('mongoose');

const User = require('../../models/User');
const { getRankNameFromElo, getRankTierForElo, normalizeEloValue } = require('./elo');

const RELATIONSHIP_FIELDS = ['friends', 'incomingFriendRequests', 'outgoingFriendRequests'];

function getUserId(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return String(value);
  }

  if (value.userId || value.id || value._id) {
    return String(value.userId || value.id || value._id);
  }

  return '';
}

function normalizeRelationshipIds(values, selfId = '') {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map((value) => getUserId(value))
    .filter((value) => mongoose.isValidObjectId(value))
    .filter((value) => value && value !== selfId)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function areStringArraysEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

async function sanitizeRelationshipReferences(user) {
  if (!user?._id) {
    return {
      changed: false,
      relatedByField: {
        friends: [],
        incomingFriendRequests: [],
        outgoingFriendRequests: []
      }
    };
  }

  const selfId = String(user._id);
  const normalizedByField = RELATIONSHIP_FIELDS.reduce((acc, fieldName) => {
    acc[fieldName] = normalizeRelationshipIds(user[fieldName], selfId);
    return acc;
  }, {});
  const allIds = [...new Set(RELATIONSHIP_FIELDS.flatMap((fieldName) => normalizedByField[fieldName]))];
  const relatedUsers = allIds.length > 0
    ? await User.find({ _id: { $in: allIds } })
    : [];
  const relatedUsersById = new Map(relatedUsers.map((relatedUser) => [String(relatedUser._id), relatedUser]));
  let changed = false;

  RELATIONSHIP_FIELDS.forEach((fieldName) => {
    const nextIds = normalizedByField[fieldName].filter((value) => relatedUsersById.has(value));
    const currentIds = normalizeRelationshipIds(user[fieldName], selfId);

    if (!areStringArraysEqual(currentIds, nextIds)) {
      user[fieldName] = nextIds;
      changed = true;
    }
  });

  if (changed) {
    await user.save();
  }

  return {
    changed,
    relatedByField: RELATIONSHIP_FIELDS.reduce((acc, fieldName) => {
      acc[fieldName] = normalizedByField[fieldName]
        .filter((value) => relatedUsersById.has(value))
        .map((value) => relatedUsersById.get(value));
      return acc;
    }, {})
  };
}

function serializeRelationshipProfile(user) {
  if (!user) {
    return null;
  }

  return {
    userId: String(user._id),
    username: user.username,
    name: user.username,
    displayName: user.username,
    guest: false,
    profilePicture: user.profilePicture || '',
    avatarUrl: user.profilePicture || '',
    banner: user.banner || '',
    description: user.description || '',
    elo: normalizeEloValue(user.elo),
    rankName: getRankNameFromElo(user.elo),
    rankTierKey: getRankTierForElo(user.elo).key,
    accountCreatedAt: user.accountCreatedAt || user.createdAt || null,
    favouriteRulesets: Array.isArray(user.favouriteRulesets) ? user.favouriteRulesets : [],
    rulesetLoadout: Array.isArray(user.rulesetLoadout) ? user.rulesetLoadout : [],
    muteAllNotifications: Boolean(user.muteAllNotifications),
    mutedForumThreadNotificationIds: Array.isArray(user.mutedForumThreadNotificationIds)
      ? user.mutedForumThreadNotificationIds.map((value) => String(value))
      : []
  };
}

function buildFriendshipStatus(viewer, target) {
  const targetUserId = getUserId(target);

  if (!targetUserId) {
    return {
      code: 'unavailable',
      label: 'Profile unavailable',
      canSendRequest: false
    };
  }

  if (target?.guest) {
    return {
      code: 'guest-user',
      label: 'Guest user',
      canSendRequest: false
    };
  }

  if (!viewer?.userId) {
    return {
      code: 'login-required',
      label: 'Log in to send a friend request',
      canSendRequest: false
    };
  }

  if (viewer.guest) {
    return {
      code: 'login-required',
      label: 'Log in to send a friend request',
      canSendRequest: false
    };
  }

  if (viewer.userId === targetUserId) {
    return {
      code: 'self',
      label: 'This is you',
      canSendRequest: false
    };
  }

  const friendIds = new Set(normalizeRelationshipIds(viewer.friends));
  const incomingIds = new Set(normalizeRelationshipIds(viewer.incomingFriendRequests));
  const outgoingIds = new Set(normalizeRelationshipIds(viewer.outgoingFriendRequests));

  if (friendIds.has(targetUserId)) {
    return {
      code: 'friends',
      label: 'Already friends',
      canSendRequest: false,
      canRemoveFriend: true
    };
  }

  if (outgoingIds.has(targetUserId)) {
    return {
      code: 'outgoing-pending',
      label: 'Request sent',
      canSendRequest: false,
      canCancelOutgoing: true
    };
  }

  if (incomingIds.has(targetUserId)) {
    return {
      code: 'incoming-pending',
      label: 'Sent you a request',
      canSendRequest: false,
      canAcceptRequest: true,
      canRejectRequest: true
    };
  }

  return {
    code: 'not-friends',
    label: 'Send Friend Request',
    canSendRequest: true
  };
}

async function buildFriendStatePayload(user) {
  if (!user) {
    return {
      friends: [],
      incomingRequests: [],
      outgoingRequests: []
    };
  }

  const { relatedByField } = await sanitizeRelationshipReferences(user);
  const sortUsers = (users) => [...users].sort((left, right) => (
    String(left.usernameLower || left.username || '').localeCompare(String(right.usernameLower || right.username || ''))
  ));

  return {
    friends: sortUsers(relatedByField.friends).map(serializeRelationshipProfile),
    incomingRequests: sortUsers(relatedByField.incomingFriendRequests).map(serializeRelationshipProfile),
    outgoingRequests: sortUsers(relatedByField.outgoingFriendRequests).map(serializeRelationshipProfile)
  };
}

async function buildProfileSummary(targetUser, viewer) {
  if (!targetUser) {
    return null;
  }

  return {
    ...serializeRelationshipProfile(targetUser),
    friendStatus: buildFriendshipStatus(viewer, targetUser)
  };
}

module.exports = {
  RELATIONSHIP_FIELDS,
  areStringArraysEqual,
  buildFriendStatePayload,
  buildFriendshipStatus,
  buildProfileSummary,
  getUserId,
  normalizeRelationshipIds,
  sanitizeRelationshipReferences,
  serializeRelationshipProfile
};
