const express = require('express');

const { clearSessionCookie, getAuthenticatedUserFromRequest } = require('../lib/auth');
const {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationsRead
} = require('../lib/notifications');

const router = express.Router();

async function requireAuthenticatedAccount(req, res, message = 'You must be logged in to use notifications') {
  const user = await getAuthenticatedUserFromRequest(req);

  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: message });
    return null;
  }

  return user;
}

router.get('/', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to view notifications');
    if (!user) {
      return;
    }

    res.json({
      ok: true,
      ...(await listNotificationsForUser(user._id))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/read', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to update notifications');
    if (!user) {
      return;
    }

    const io = req.app.get('io') || null;
    const notificationIds = Array.isArray(req.body?.notificationIds) ? req.body.notificationIds : [];
    await markNotificationsRead(user._id, notificationIds, io);

    res.json({
      ok: true
    });
  } catch (error) {
    next(error);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    const user = await requireAuthenticatedAccount(req, res, 'You must be logged in to update notifications');
    if (!user) {
      return;
    }

    const io = req.app.get('io') || null;
    await markAllNotificationsRead(user._id, io);

    res.json({
      ok: true
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
