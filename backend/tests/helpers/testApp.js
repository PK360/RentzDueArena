const createApp = require('../../src/app');

function createFakeIo() {
  const emitted = [];

  return {
    emitted,
    io: {
      to(target) {
        return {
          emit(event, payload) {
            emitted.push({ target, event, payload });
          }
        };
      }
    }
  };
}

function createTestApp() {
  const app = createApp();
  const { io, emitted } = createFakeIo();
  app.set('io', io);

  return {
    app,
    emitted,
    io
  };
}

module.exports = {
  createFakeIo,
  createTestApp
};
