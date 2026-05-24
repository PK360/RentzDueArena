const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const promptfooBin = path.join(repoRoot, 'node_modules', '.bin', 'promptfoo');
const mode = process.argv[2] === 'real' ? 'real' : 'mock';
const configs = mode === 'real'
  ? [
    path.join(repoRoot, 'evals/promptfoo/gameplay-bot/gameplay-bot.real.promptfooconfig.yaml'),
    path.join(repoRoot, 'evals/promptfoo/trainer-bot/trainer-bot.real.promptfooconfig.yaml'),
    path.join(repoRoot, 'evals/promptfoo/editor-bot/editor-bot.cloud.promptfooconfig.yaml')
  ]
  : [
    path.join(repoRoot, 'evals/promptfoo/gameplay-bot/gameplay-bot.mock.promptfooconfig.yaml'),
    path.join(repoRoot, 'evals/promptfoo/trainer-bot/trainer-bot.mock.promptfooconfig.yaml'),
    path.join(repoRoot, 'evals/promptfoo/editor-bot/editor-bot.mock.promptfooconfig.yaml')
  ];

for (const configPath of configs) {
  const args = ['eval', '-c', configPath];
  if (mode === 'real') {
    args.push('--max-concurrency', '1');
  }

  const result = spawnSync(promptfooBin, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PROMPTFOO_CONFIG_DIR: '.promptfoo'
    },
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
