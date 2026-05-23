const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    restoreMocks: true,
    clearMocks: true,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: [
        'engine/**/*.js',
        'rulesets/**/*.js',
        'socketManager.js',
        'src/**/*.js'
      ]
    }
  }
});
