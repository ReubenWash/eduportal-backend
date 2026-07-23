const path = require('path');
const { spawnSync } = require('child_process');

process.env.PUPPETEER_SKIP_DOWNLOAD = '1';

const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
