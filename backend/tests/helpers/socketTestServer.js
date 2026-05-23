const http = require('http');
const { Server } = require('socket.io');

const createApp = require('../../src/app');
const attachSocketManager = require('../../socketManager');

async function startSocketTestServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  app.set('io', io);
  attachSocketManager(io);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    app,
    io,
    port,
    server,
    url: `http://127.0.0.1:${port}`,
    async close() {
      io.disconnectSockets(true);
      await new Promise((resolve) => io.close(resolve));
      if (!server.listening) {
        return;
      }
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

module.exports = {
  startSocketTestServer
};
