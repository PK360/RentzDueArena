require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const createApp = require('./src/app');
const { connectToMongo, disconnectFromMongo, getMongoUri } = require('./src/lib/database');
const registerSocketHandlers = require('./socketManager');

const PORT = Number(process.env.PORT || 4000);

function start() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || true,
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  app.set('io', io);
  registerSocketHandlers(io);

  let isShuttingDown = false;
  const shutdown = (signal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`${signal} received, closing sockets and HTTP server...`);
    io.disconnectSockets(true);
    io.close(() => {
      server.close(() => {
        void disconnectFromMongo()
          .catch((error) => {
            console.warn('MongoDB disconnect error:', error.message);
          })
          .finally(() => {
            process.exit(0);
          });
      });
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  server.on('error', (error) => {
    console.error('Failed to start backend listener', error);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`Rentz Arena backend listening on port ${PORT}`);
  });

  mongoose.connection.on('error', (error) => {
    console.warn('MongoDB connection error:', error.message);
  });

  void connectToMongo()
    .then(() => {
      console.log(`MongoDB connected to ${getMongoUri()}`);
    })
    .catch((error) => {
      console.warn(
        'MongoDB unavailable, continuing with degraded in-memory mode:',
        error.message
      );
    });
}

start();
