const express = require('express');

const Ruleset = require('../../models/Ruleset');
const { clearSessionCookie, getAuthenticatedUserFromRequest } = require('../lib/auth');
const {
  buildRulesetContentHash,
  serializeStoredRuleset
} = require('../lib/customRulesets');
const {
  compileRuleset,
  evaluateIsolatedHands,
  buildRuleSnapshot
} = require('../../engine/evaluator');
const {
  buildSafeRulesetPayload,
  reviewRulesetWithEditorBot
} = require('../lib/editorBot');

const router = express.Router();

const RULESET_AUTHOR_SELECT = 'username displayName profilePicture banner';

function readRulesetField(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeRulesetType(type) {
  return type === 'end_game' ? 'end_game' : 'per_round';
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

router.get('/ruleset-rater', async (_req, res, next) => {
  try {
    const rulesets = await Ruleset.find({ isPublic: true })
      .populate('author', RULESET_AUTHOR_SELECT)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      ok: true,
      rulesets: rulesets.map((ruleset) => serializeStoredRuleset(ruleset))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/save-to-profile', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to save rulesets to your profile');
    if (!user) {
      return;
    }

    const title = readRulesetField(req.body.longName || req.body.title, 'Untitled Ruleset');
    const shortName = readRulesetField(req.body.shortName || req.body.abbreviation, '');
    const type = normalizeRulesetType(req.body.type);
    const code = String(req.body.code || '');

    if (!code.trim()) {
      return res.status(400).json({ error: 'Ruleset code is required' });
    }

    compileRuleset(code, type);

    const contentHash = buildRulesetContentHash({
      title,
      shortName,
      type,
      code
    });
    let ruleset = await Ruleset.findOne({
      author: user._id,
      contentHash
    });

    if (!ruleset) {
      ruleset = new Ruleset({
        title,
        shortName,
        description: readRulesetField(req.body.description),
        author: user._id,
        type,
        code,
        contentHash,
        isPublic: false
      });
    } else {
      ruleset.title = title;
      ruleset.shortName = shortName;
      ruleset.description = readRulesetField(req.body.description);
      ruleset.type = type;
      ruleset.code = code;
    }

    await ruleset.save();

    const savedRuleIds = new Set((Array.isArray(user.savedRulesets) ? user.savedRulesets : []).map((value) => String(value)));
    const createdRuleIds = new Set((Array.isArray(user.createdRulesets) ? user.createdRulesets : []).map((value) => String(value)));
    savedRuleIds.add(String(ruleset._id));
    createdRuleIds.add(String(ruleset._id));
    user.savedRulesets = [...savedRuleIds];
    user.createdRulesets = [...createdRuleIds];
    await user.save();

    const populatedRuleset = await Ruleset.findById(ruleset._id)
      .populate('author', RULESET_AUTHOR_SELECT)
      .lean();

    res.json({
      ok: true,
      message: 'Ruleset saved to your profile library.',
      ruleset: serializeStoredRuleset(populatedRuleset, user)
    });
  } catch (error) {
    if (error.code === 11000) {
      try {
        const user = await getAuthenticatedUserFromRequest(req);
        const title = readRulesetField(req.body.longName || req.body.title, 'Untitled Ruleset');
        const shortName = readRulesetField(req.body.shortName || req.body.abbreviation, '');
        const type = normalizeRulesetType(req.body.type);
        const code = String(req.body.code || '');
        const contentHash = buildRulesetContentHash({ title, shortName, type, code });
        const existingRuleset = user ? await Ruleset.findOne({ author: user._id, contentHash }).populate('author', RULESET_AUTHOR_SELECT).lean() : null;
        if (existingRuleset) {
          return res.json({
            ok: true,
            message: 'Ruleset is already saved in your profile library.',
            ruleset: serializeStoredRuleset(existingRuleset, user)
          });
        }
      } catch {
        // Fall back to generic error handler below.
      }
    }

    if (error.message) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
});

function compileRulesetRequest(req, res, next) {
  try {
    const code = String(req.body.code || '');
    const type = String(req.body.type || 'per_round');
    const ast = compileRuleset(code, type);

    res.json({ ok: true, ast });
  } catch (error) {
    next(error);
  }
}

router.post('/compile', compileRulesetRequest);
router.post('/parse', compileRulesetRequest);

router.post('/evaluate-preview', (req, res, next) => {
  try {
    const {
      code,
      type = 'per_round',
      playerCount,
      initialPoints = 0,
      handCards = [],
      nonDiscardedCards = []
    } = req.body;

    const snapshot = buildRuleSnapshot({
      playerCount,
      initialPoints,
      handCards,
      nonDiscardedCards
    });

    const result = evaluateIsolatedHands({
      code,
      type,
      evaluations: [{ snapshot }]
    });

    res.json({ ok: true, snapshot, result: result.results[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/judge', async (req, res, next) => {
  try {
    const ruleset = buildSafeRulesetPayload(req.body);
    const clientRulesetHash = typeof req.body?.clientRulesetHash === 'string'
      ? req.body.clientRulesetHash.trim().slice(0, 40)
      : '';
    let ast = null;

    try {
      ast = compileRuleset(ruleset.code, ruleset.type);
    } catch (error) {
      return res.status(400).json({
        success: false,
        judgment: null,
        source: 'error',
        requestId: '',
        rulesetHash: clientRulesetHash,
        errorCode: 'compiler-error',
        usedFallback: false,
        usedCache: false,
        error: `Fix compiler errors before asking the Editor Bot to judge this ruleset: ${error.message}`,
        compiler: {
          status: 'error',
          message: error.message,
          errors: [error.message],
          warnings: [],
          ast: null
        }
      });
    }

    const compiler = {
      status: 'compiled',
      message: 'Ruleset compiled successfully.',
      errors: [],
      warnings: [],
      ast
    };
    const review = await reviewRulesetWithEditorBot({
      ruleset,
      ast,
      compiler,
      rulesetHashOverride: clientRulesetHash
    });

    res.json({
      ok: true,
      success: true,
      compiler,
      judgment: review,
      review,
      source: review.reviewSource || 'cloud',
      requestId: review.requestId || '',
      rulesetHash: review.rulesetHash || clientRulesetHash,
      errorCode: review.errorCode || '',
      usedFallback: review.usedFallback === true,
      usedCache: review.usedCache === true
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        judgment: null,
        source: 'error',
        requestId: '',
        rulesetHash: '',
        errorCode: 'request-error',
        usedFallback: false,
        usedCache: false,
        error: error.message
      });
    }

    next(error);
  }
});

module.exports = router;
