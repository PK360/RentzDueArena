const express = require('express');
const mongoose = require('mongoose');

const SavedGame = require('../../models/SavedGame');
const { clearSessionCookie, getAuthenticatedUserFromRequest } = require('../lib/auth');
const { finalizeEndedSavedGame } = require('../lib/gamePersistence');

const router = express.Router();

async function requireAuthenticatedAccount(req, res, message = 'You must be logged in to use this feature') {
  const user = await getAuthenticatedUserFromRequest(req);

  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: message });
    return null;
  }

  return user;
}

router.post('/saved/:savedGameId/end', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to end a saved game');
    if (!user) {
      return;
    }

    const savedGameId = String(req.params.savedGameId || '').trim();
    if (!mongoose.isValidObjectId(savedGameId)) {
      return res.status(400).json({ error: 'Saved game id is invalid' });
    }

    const savedGame = await SavedGame.findOneAndUpdate({
      _id: savedGameId,
      ownerUserId: user._id,
      status: 'saved'
    }, {
      $set: {
        status: 'ended',
        endedAt: new Date()
      }
    }, {
      new: true
    });

    if (!savedGame) {
      return res.status(404).json({ error: 'Saved game not found' });
    }

    const matchHistory = await finalizeEndedSavedGame(savedGame);

    res.json({
      ok: true,
      endedSavedGameId: savedGameId,
      matchHistoryId: matchHistory?._id ? String(matchHistory._id) : null,
      message: 'Saved game ended.'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
