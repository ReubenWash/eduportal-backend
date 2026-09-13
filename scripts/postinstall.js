const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('📦 Running postinstall script...');

const isRender = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL !== undefined;

const createDirectories = () => {
  const dirs = [
    'uploads',
    'uploads/reports',
    'uploads/temp',
    'uploads/students',
    'uploads/staff',
    'uploads/schools',
    'logs',
  ];

  dirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  });
};

const installPuppeteerChrome = () => {
  console.log('🔄 Installing Puppeteer Chrome...');
  try {
    const cacheDir = isRender
      ? '/opt/render/.cache/puppeteer'
      : path.join(process.cwd(), '.cache', 'puppeteer');

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    process.env.PUPPETEER_CACHE_DIR = cacheDir;
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';

    execSync('npx puppeteer browsers install chrome', {
      stdio: 'inherit',
      env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir }
    });

    console.log('✅ Puppeteer Chrome installed successfully!');
  } catch (error) {
    console.error('❌ Failed to install Puppeteer Chrome:', error.message);
    console.log('⚠️ Continuing without Puppeteer...');
    // Puppeteer failure is non-fatal — leave as-is
  }
};

const setup = async () => {
  console.log('🚀 Setting up project...');
  console.log(`📁 Environment: ${isRender ? 'Render' : 'Local'}`);

  createDirectories();

  if (isRender || process.env.INSTALL_PUPPETEER === 'true') {
    installPuppeteerChrome();
  } else {
    console.log('ℹ️ Skipping Puppeteer Chrome installation (local environment)');
  }

  // ── Generate Prisma client — MUST succeed ──
  console.log('🔄 Generating Prisma client...');
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma client generated successfully!');
  } catch (error) {
    console.error('❌ Failed to generate Prisma client:', error.message);
    throw error;   // ← propagate so the deploy fails loudly
  }

  console.log('✅ Postinstall completed successfully!');
};

setup().catch(error => {
  console.error('❌ Postinstall failed:', error);
  process.exit(1);
});