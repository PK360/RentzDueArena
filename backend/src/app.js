const express = require('express');
const cors = require('cors');
const path = require('path');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const forumRoutes = require('./routes/forumRoutes');
const rulesetRoutes = require('./routes/rulesetRoutes');
const gameRoutes = require('./routes/gameRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || true,
      credentials: true
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use('/media', express.static(path.resolve(__dirname, '../public/media')));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/forum', forumRoutes);
  app.use('/api/rulesets', rulesetRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/notifications', notificationRoutes);

  app.use((error, _req, res, _next) => {
    console.error(error);

    res.status(error.statusCode || 500).json({
      error: error.message || 'Internal server error'
    });
  });

  return app;
}

module.exports = createApp;
