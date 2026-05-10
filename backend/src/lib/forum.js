const crypto = require('crypto');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const path = require('path');

const Ruleset = require('../../models/Ruleset');
const { serializeStoredRuleset } = require('./customRulesets');
const { normalizeRelationshipIds } = require('./friends');

const FORUM_MEDIA_DIR = path.resolve(__dirname, '../../public/media/forum');
const MAX_FORUM_TEXT_LENGTH = 1200;
const MAX_FORUM_SEARCH_LENGTH = 80;
const MAX_FORUM_MEDIA_SIZE_BYTES = 4 * 1024 * 1024;
const FORUM_MEDIA_MIME_TYPES = Object.freeze({
  'image/jpeg': { extension: '.jpeg', kind: 'image' },
  'image/jpg': { extension: '.jpg', kind: 'image' },
  'image/png': { extension: '.png', kind: 'image' },
  'image/webp': { extension: '.webp', kind: 'image' },
  'image/gif': { extension: '.gif', kind: 'gif' }
});

function getEntityId(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return String(value);
  }

  if (value._id || value.id || value.userId) {
    return String(value._id || value.id || value.userId);
  }

  return '';
}

function normalizeObjectIdArray(values, selfId = '') {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map((value) => getEntityId(value))
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

function normalizeForumText(value) {
  const text = String(value || '').trim();

  if (text.length > MAX_FORUM_TEXT_LENGTH) {
    throw new Error(`Forum posts must be ${MAX_FORUM_TEXT_LENGTH} characters or less`);
  }

  return text;
}

function normalizeForumSearchQuery(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FORUM_SEARCH_LENGTH);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureForumMediaDirectory() {
  await fs.mkdir(FORUM_MEDIA_DIR, { recursive: true });
}

function parseUploadedForumMedia(upload) {
  if (!upload) {
    return null;
  }

  if (typeof upload !== 'object') {
    throw new Error('Media upload is invalid');
  }

  const mimeType = String(upload.type || '').trim().toLowerCase();
  const mediaDefinition = FORUM_MEDIA_MIME_TYPES[mimeType];
  if (!mediaDefinition) {
    throw new Error('Forum media must be a PNG, JPEG, WebP, or GIF image');
  }

  const dataUrl = String(upload.data || '').trim();
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error('Media upload is invalid');
  }

  if (match[1].toLowerCase() !== mimeType) {
    throw new Error('Media upload type does not match the file data');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw new Error('Media upload is empty');
  }

  if (buffer.length > MAX_FORUM_MEDIA_SIZE_BYTES) {
    throw new Error('Forum media must be 4 MB or smaller');
  }

  return {
    buffer,
    extension: mediaDefinition.extension,
    kind: mediaDefinition.kind,
    mimeType
  };
}

async function saveUploadedForumMedia(upload) {
  const parsedUpload = parseUploadedForumMedia(upload);
  if (!parsedUpload) {
    return null;
  }

  await ensureForumMediaDirectory();
  const filename = `forum-${Date.now()}-${crypto.randomUUID()}${parsedUpload.extension}`;
  const absolutePath = path.join(FORUM_MEDIA_DIR, filename);
  await fs.writeFile(absolutePath, parsedUpload.buffer);

  return {
    url: `/media/forum/${filename}`,
    kind: parsedUpload.kind,
    mimeType: parsedUpload.mimeType
  };
}

async function resolveAttachedRuleset(input) {
  if (!input) {
    return null;
  }

  const rulesetId = typeof input === 'object'
    ? String(input.rulesetId || input.id || '')
    : String(input || '');
  if (!mongoose.isValidObjectId(rulesetId)) {
    throw new Error('Attached ruleset is invalid');
  }

  const ruleset = await Ruleset.findById(rulesetId)
    .populate('author', 'username displayName profilePicture banner')
    .lean();
  if (!ruleset) {
    throw new Error('Attached ruleset is invalid');
  }

  return {
    ruleset: ruleset._id,
    id: String(ruleset._id),
    label: ruleset.title,
    abbreviation: ruleset.shortName || '',
    type: ruleset.type || 'per_round',
    code: ruleset.code || ''
  };
}

function serializeForumAuthor(user) {
  if (!user) {
    return null;
  }

  const userId = getEntityId(user);
  const username = String(user.username || user.displayName || user.name || 'Player');
  const avatarUrl = String(user.profilePicture || user.avatarUrl || '');

  return {
    userId,
    id: userId,
    username,
    name: username,
    displayName: username,
    guest: false,
    profilePicture: avatarUrl,
    avatarUrl,
    banner: String(user.banner || ''),
    elo: user.elo ?? user.rating ?? user.mmr ?? user.rank ?? null,
    rankName: user.rankName || null
  };
}

function sortForumFeedEntries(entries, viewer) {
  const friendIds = new Set(normalizeRelationshipIds(viewer?.friends));

  return [...entries].sort((left, right) => {
    const leftAuthorId = getEntityId(left?.author);
    const rightAuthorId = getEntityId(right?.author);
    const leftFriendRank = friendIds.has(leftAuthorId) ? 0 : 1;
    const rightFriendRank = friendIds.has(rightAuthorId) ? 0 : 1;

    if (leftFriendRank !== rightFriendRank) {
      return leftFriendRank - rightFriendRank;
    }

    return new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime();
  });
}

function serializeAttachedRuleset(attachment, viewer) {
  if (!attachment?.id) {
    return null;
  }

  const storedRuleset = attachment.ruleset && typeof attachment.ruleset === 'object'
    ? serializeStoredRuleset(attachment.ruleset, viewer)
    : null;

  return {
    id: attachment.id,
    label: attachment.label,
    abbreviation: attachment.abbreviation,
    type: attachment.type || 'per_round',
    code: attachment.code || '',
    averageRating: storedRuleset?.averageRating ?? null,
    viewerRating: storedRuleset?.viewerRating ?? null,
    ratingCount: storedRuleset?.ratingCount ?? 0,
    originalCreator: storedRuleset?.originalCreator || null,
    rulesetId: storedRuleset?.id || attachment.id
  };
}

function serializeForumPost(post, viewer, { replies = [], replyCount = replies.length } = {}) {
  if (!post) {
    return null;
  }

  const viewerId = getEntityId(viewer);
  const likedBy = normalizeObjectIdArray(post.likedBy);
  const bookmarkedBy = normalizeObjectIdArray(post.bookmarkedBy);
  const author = serializeForumAuthor(post.author);
  const friendIds = new Set(normalizeRelationshipIds(viewer?.friends));

  return {
    id: getEntityId(post),
    parentPostId: getEntityId(post.parentPost) || null,
    rootPostId: getEntityId(post.rootPost) || null,
    createdAt: post.createdAt || null,
    updatedAt: post.updatedAt || null,
    deletedAt: post.deletedAt || null,
    isDeleted: Boolean(post.deletedAt),
    text: String(post.text || ''),
    media: post.media?.url
      ? {
        url: post.media.url,
        kind: post.media.kind || 'image',
        mimeType: post.media.mimeType || ''
      }
      : null,
    attachedRuleset: serializeAttachedRuleset(post.attachedRuleset, viewer),
    likeCount: likedBy.length,
    bookmarkCount: bookmarkedBy.length,
    replyCount: Math.max(0, Number(replyCount || 0)),
    likedByViewer: viewerId ? likedBy.includes(viewerId) : false,
    bookmarkedByViewer: viewerId ? bookmarkedBy.includes(viewerId) : false,
    isFriendAuthor: author?.userId ? friendIds.has(author.userId) : false,
    author,
    replies
  };
}

function buildForumThread(rootPosts, replyPosts, viewer) {
  const repliesByParentId = new Map();

  replyPosts.forEach((reply) => {
    const parentId = getEntityId(reply.parentPost);
    if (!parentId) {
      return;
    }

    if (!repliesByParentId.has(parentId)) {
      repliesByParentId.set(parentId, []);
    }

    repliesByParentId.get(parentId).push(reply);
  });

  const buildReplies = (post) => {
    const childPosts = (repliesByParentId.get(getEntityId(post)) || [])
      .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime());
    const replies = childPosts.map((childPost) => buildReplies(childPost));

    return serializeForumPost(post, viewer, {
      replies,
      replyCount: childPosts.length
    });
  };

  return sortForumFeedEntries(rootPosts, viewer).map((post) => buildReplies(post));
}

function serializeForumUserPreview(user) {
  return serializeForumAuthor(user);
}

module.exports = {
  MAX_FORUM_MEDIA_SIZE_BYTES,
  MAX_FORUM_SEARCH_LENGTH,
  MAX_FORUM_TEXT_LENGTH,
  buildForumThread,
  escapeRegex,
  getEntityId,
  normalizeForumSearchQuery,
  normalizeForumText,
  normalizeObjectIdArray,
  resolveAttachedRuleset,
  saveUploadedForumMedia,
  serializeForumPost,
  serializeForumUserPreview,
  sortForumFeedEntries
};
