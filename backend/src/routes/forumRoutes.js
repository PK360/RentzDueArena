const express = require('express');
const mongoose = require('mongoose');

const ForumPost = require('../../models/ForumPost');
const Ruleset = require('../../models/Ruleset');
const User = require('../../models/User');
const SavedGame = require('../../models/SavedGame');
const MatchHistory = require('../../models/MatchHistory');
const { clearSessionCookie, getAuthenticatedUserFromRequest } = require('../lib/auth');
const {
  serializeMatchHistoryForLibrary,
  serializeSavedGameForLibrary
} = require('../lib/gamePersistence');
const {
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
} = require('../lib/forum');
const {
  normalizeRulesetRatingValue,
  serializeStoredRuleset
} = require('../lib/customRulesets');

const router = express.Router();

const FORUM_AUTHOR_SELECT = 'username displayName profilePicture banner elo rankName';
const FEED_LIMIT = 60;
const SEARCH_POST_LIMIT = 30;
const SEARCH_USER_LIMIT = 24;
const LIBRARY_BOOKMARK_LIMIT = 24;
const LIBRARY_SAVED_GAMES_LIMIT = 24;
const LIBRARY_MATCH_HISTORY_LIMIT = 36;
const VISIBLE_FORUM_POST_FILTER = { deletedAt: null };

function readPostId(value) {
  return String(value || '').trim();
}

async function getViewer(req) {
  return (await getAuthenticatedUserFromRequest(req)) || null;
}

async function requireAuthenticatedAccount(req, res, message = 'You must be logged in to use Rentz Forum') {
  const user = await getAuthenticatedUserFromRequest(req);

  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: message });
    return null;
  }

  return user;
}

function applyForumPostPopulate(query) {
  return query
    .populate('author', FORUM_AUTHOR_SELECT)
    .populate({
      path: 'attachedRuleset.ruleset',
      populate: {
        path: 'author',
        select: FORUM_AUTHOR_SELECT
      }
    });
}

function buildVisibleForumFilter(filter = {}) {
  return {
    ...filter,
    ...VISIBLE_FORUM_POST_FILTER
  };
}

async function loadPopulatedForumPost(postId, { includeDeleted = false } = {}) {
  const query = includeDeleted
    ? ForumPost.findById(postId)
    : ForumPost.findOne(buildVisibleForumFilter({ _id: postId }));

  return applyForumPostPopulate(query).lean();
}

async function loadSerializedPost(postId, viewer) {
  const post = await loadPopulatedForumPost(postId);
  if (!post) {
    return null;
  }

  const replyCount = await ForumPost.countDocuments(buildVisibleForumFilter({ parentPost: post._id }));
  return serializeForumPost(post, viewer, { replyCount, replies: [] });
}

async function saveRulesetToLibrary(user, rulesetId) {
  const currentSavedRulesets = normalizeObjectIdArray(user.savedRulesets);
  if (currentSavedRulesets.includes(String(rulesetId))) {
    return {
      changed: false,
      message: 'Ruleset is already saved in your profile library.'
    };
  }

  user.savedRulesets = [...currentSavedRulesets, String(rulesetId)];
  await user.save();

  return {
    changed: true,
    message: 'Ruleset saved to your profile library.'
  };
}

async function loadThreadPayload(postId, viewer) {
  const selectedPost = await loadPopulatedForumPost(postId);
  if (!selectedPost) {
    return null;
  }

  const rootId = getEntityId(selectedPost.rootPost) || getEntityId(selectedPost);
  const threadPosts = await applyForumPostPopulate(
    ForumPost.find(buildVisibleForumFilter({
      $or: [
        { _id: rootId },
        { rootPost: rootId }
      ]
    })).sort({ createdAt: 1 })
  ).lean();
  const postsById = new Map(threadPosts.map((post) => [getEntityId(post), post]));
  const repliesByParentId = new Map();

  threadPosts.forEach((post) => {
    const parentId = getEntityId(post.parentPost);
    if (!parentId) {
      return;
    }

    if (!repliesByParentId.has(parentId)) {
      repliesByParentId.set(parentId, []);
    }
    repliesByParentId.get(parentId).push(post);
  });

  const buildSubtree = (post) => {
    const children = (repliesByParentId.get(getEntityId(post)) || [])
      .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime());
    const replies = children.map((child) => buildSubtree(child));

    return serializeForumPost(post, viewer, {
      replies,
      replyCount: children.length
    });
  };

  const parentChain = [];
  let cursor = selectedPost;
  while (getEntityId(cursor.parentPost)) {
    const parentPost = postsById.get(getEntityId(cursor.parentPost));
    if (!parentPost) {
      break;
    }

    const directChildCount = (repliesByParentId.get(getEntityId(parentPost)) || []).length;
    parentChain.unshift(serializeForumPost(parentPost, viewer, {
      replies: [],
      replyCount: directChildCount
    }));
    cursor = parentPost;
  }

  return {
    rootPostId: rootId,
    parents: parentChain,
    selected: buildSubtree(selectedPost)
  };
}

router.get('/feed', async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    const rootPosts = await applyForumPostPopulate(
      ForumPost.find(buildVisibleForumFilter({ parentPost: null }))
        .sort({ createdAt: -1 })
        .limit(FEED_LIMIT)
    ).lean();

    const rootPostIds = rootPosts.map((post) => post._id);
    const replyPosts = rootPostIds.length === 0
      ? []
      : await applyForumPostPopulate(
        ForumPost.find(buildVisibleForumFilter({ rootPost: { $in: rootPostIds } }))
          .sort({ createdAt: 1 })
      ).lean();

    res.json({
      ok: true,
      posts: buildForumThread(rootPosts, replyPosts, viewer)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/library', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to view your library');
    if (!user) {
      return;
    }

    const populatedUser = await User.findById(user._id)
      .populate({
        path: 'savedRulesets',
        populate: {
          path: 'author',
          select: FORUM_AUTHOR_SELECT
        }
      })
      .lean();
    const savedRulesets = (Array.isArray(populatedUser?.savedRulesets) ? populatedUser.savedRulesets : [])
      .map((ruleset) => serializeStoredRuleset(ruleset, user));

    const bookmarkedPosts = await applyForumPostPopulate(
      ForumPost.find(buildVisibleForumFilter({
        bookmarkedBy: user._id,
        'attachedRuleset.ruleset': { $exists: true }
      }))
        .sort({ createdAt: -1 })
        .limit(LIBRARY_BOOKMARK_LIMIT)
    ).lean();

    const [savedGames, matchHistory] = await Promise.all([
      SavedGame.find({
        ownerUserId: user._id,
        status: 'saved'
      })
        .sort({ savedAt: -1, createdAt: -1 })
        .limit(LIBRARY_SAVED_GAMES_LIMIT)
        .lean(),
      MatchHistory.find({
        participantUserIds: user._id
      })
        .sort({ completedAt: -1, createdAt: -1 })
        .limit(LIBRARY_MATCH_HISTORY_LIMIT)
        .lean()
    ]);

    res.json({
      ok: true,
      savedRulesets,
      savedGames: savedGames.map((entry) => serializeSavedGameForLibrary(entry)).filter(Boolean),
      matchHistory: matchHistory.map((entry) => serializeMatchHistoryForLibrary(entry, user._id)).filter(Boolean),
      bookmarkedRulesetPosts: bookmarkedPosts.map((post) => serializeForumPost(post, user, {
        replies: [],
        replyCount: 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to post on Rentz Forum');
    if (!user) {
      return;
    }

    const text = normalizeForumText(req.body.text);
    const media = await saveUploadedForumMedia(req.body.mediaUpload || null);
    const attachedRuleset = await resolveAttachedRuleset(req.body.attachedRuleset || null);
    const parentPostId = readPostId(req.body.parentPostId);
    let parentPost = null;

    if (!text && !media && !attachedRuleset) {
      return res.status(400).json({ error: 'Write something, attach media, or include a ruleset before posting' });
    }

    if (parentPostId) {
      if (!mongoose.isValidObjectId(parentPostId)) {
        return res.status(400).json({ error: 'Reply target is invalid' });
      }

      parentPost = await ForumPost.findOne(buildVisibleForumFilter({ _id: parentPostId }));
      if (!parentPost) {
        return res.status(404).json({ error: 'Reply target not found' });
      }
    }

    const post = await ForumPost.create({
      author: user._id,
      parentPost: parentPost?._id || null,
      rootPost: parentPost ? (parentPost.rootPost || parentPost._id) : null,
      text,
      media,
      attachedRuleset,
      likedBy: [],
      bookmarkedBy: []
    });

    res.status(201).json({
      ok: true,
      post: await loadSerializedPost(post._id, user)
    });
  } catch (error) {
    if (error.message) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
});

router.delete('/posts/:postId', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to delete forum posts');
    if (!user) {
      return;
    }

    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const post = await ForumPost.findById(postId).select('author parentPost rootPost deletedAt');
    if (!post) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    if (post.deletedAt) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    if (String(post.author) !== String(user._id)) {
      return res.status(403).json({ error: 'You can only delete your own forum posts' });
    }

    const parentPostId = getEntityId(post.parentPost) || null;
    const rootPostId = getEntityId(post.rootPost) || null;

    await ForumPost.updateOne(
      { _id: post._id },
      {
        $set: {
          text: '',
          media: null,
          attachedRuleset: null,
          deletedAt: post.deletedAt || new Date(),
          likedBy: [],
          bookmarkedBy: []
        }
      }
    );

    return res.json({
      ok: true,
      removed: true,
      deletedPostId: postId,
      parentPostId,
      rootPostId
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:postId/like', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to like forum posts');
    if (!user) {
      return;
    }

    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const post = await ForumPost.findOne(buildVisibleForumFilter({ _id: postId })).select('likedBy');
    if (!post) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    const userId = String(user._id);
    const hasLiked = post.likedBy.some((value) => String(value) === userId);
    await ForumPost.updateOne(
      { _id: post._id },
      hasLiked
        ? { $pull: { likedBy: user._id } }
        : { $addToSet: { likedBy: user._id } }
    );

    res.json({
      ok: true,
      liked: !hasLiked,
      post: await loadSerializedPost(postId, user)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:postId/bookmark', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to save forum posts');
    if (!user) {
      return;
    }

    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const post = await ForumPost.findOne(buildVisibleForumFilter({ _id: postId })).select('bookmarkedBy');
    if (!post) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    const userId = String(user._id);
    const hasBookmarked = post.bookmarkedBy.some((value) => String(value) === userId);
    await ForumPost.updateOne(
      { _id: post._id },
      hasBookmarked
        ? { $pull: { bookmarkedBy: user._id } }
        : { $addToSet: { bookmarkedBy: user._id } }
    );

    res.json({
      ok: true,
      bookmarked: !hasBookmarked,
      post: await loadSerializedPost(postId, user)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:postId/copy-ruleset', async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const post = await loadPopulatedForumPost(postId);
    if (!post) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    if (!post.attachedRuleset?.ruleset) {
      return res.status(404).json({ error: 'This post does not have an attached ruleset' });
    }

    res.json({
      ok: true,
      ruleset: serializeStoredRuleset(post.attachedRuleset.ruleset, viewer)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:postId/save-ruleset', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to save attached rulesets');
    if (!user) {
      return;
    }

    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const post = await ForumPost.findOne(buildVisibleForumFilter({ _id: postId })).select('attachedRuleset.ruleset');
    if (!post) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    const rulesetId = getEntityId(post.attachedRuleset?.ruleset);
    if (!rulesetId) {
      return res.status(404).json({ error: 'This post does not have a saveable ruleset attachment' });
    }

    const result = await saveRulesetToLibrary(user, rulesetId);

    res.json({
      ok: true,
      message: result.message
    });
  } catch (error) {
    if (error.message) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
});

router.post('/posts/:postId/rate-ruleset', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to rate attached rulesets');
    if (!user) {
      return;
    }

    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const ratingValue = normalizeRulesetRatingValue(req.body.value);
    const post = await ForumPost.findOne(buildVisibleForumFilter({ _id: postId })).select('attachedRuleset.ruleset');
    if (!post) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    const ruleset = await Ruleset.findById(post.attachedRuleset?.ruleset);
    if (!ruleset) {
      return res.status(404).json({ error: 'This post does not have a rateable ruleset attachment' });
    }

    const userId = String(user._id);
    const existingRating = (Array.isArray(ruleset.ratings) ? ruleset.ratings : []).find((rating) => String(rating.user) === userId);
    if (existingRating) {
      existingRating.value = ratingValue;
    } else {
      ruleset.ratings.push({
        user: user._id,
        value: ratingValue
      });
    }

    await ruleset.save();

    res.json({
      ok: true,
      post: await loadSerializedPost(postId, user)
    });
  } catch (error) {
    if (error.message) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    const query = normalizeForumSearchQuery(req.query.q);

    if (!query) {
      return res.json({
        ok: true,
        query: '',
        posts: [],
        users: [],
        friends: []
      });
    }

    const postDocs = await applyForumPostPopulate(
      ForumPost.find({
        parentPost: null,
        deletedAt: null,
        $text: { $search: query }
      }, {
        score: { $meta: 'textScore' }
      })
        .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
        .limit(SEARCH_POST_LIMIT)
    ).lean();

    const sortedPosts = sortForumFeedEntries(postDocs, viewer).map((post) => serializeForumPost(post, viewer, {
      replies: [],
      replyCount: 0
    }));

    const userRegex = new RegExp(escapeRegex(query.toLowerCase()).replace(/\s+/g, '.*'), 'i');
    const users = await User.find({
      usernameLower: { $regex: userRegex }
    })
      .select(FORUM_AUTHOR_SELECT)
      .sort({ usernameLower: 1 })
      .limit(SEARCH_USER_LIMIT)
      .lean();

    const friendIds = normalizeObjectIdArray(viewer?.friends);
    const friends = friendIds.length === 0
      ? []
      : await User.find({
        _id: { $in: friendIds },
        usernameLower: { $regex: userRegex }
      })
        .select(FORUM_AUTHOR_SELECT)
        .sort({ usernameLower: 1 })
        .limit(SEARCH_USER_LIMIT)
        .lean();

    res.json({
      ok: true,
      query,
      posts: sortedPosts,
      users: users.map((user) => serializeForumUserPreview(user)),
      friends: friends.map((friend) => serializeForumUserPreview(friend))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/posts/:postId/thread', async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const thread = await loadThreadPayload(postId, viewer);
    if (!thread) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    res.json({
      ok: true,
      thread
    });
  } catch (error) {
    next(error);
  }
});

router.get('/posts/:postId', async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    const postId = readPostId(req.params.postId);
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ error: 'Forum post is invalid' });
    }

    const post = await loadSerializedPost(postId, viewer);
    if (!post) {
      return res.status(404).json({ error: 'Forum post not found' });
    }

    res.json({
      ok: true,
      post
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
