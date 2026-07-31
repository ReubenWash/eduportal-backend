const puppeteer = require('puppeteer');
const path = require('path');

// Get the cache directory
const getCacheDir = () => {
  // For Render.com, use /opt/render/.cache/puppeteer
  if (process.env.RENDER) {
    return '/opt/render/.cache/puppeteer';
  }
  // For local development
  return path.join(process.cwd(), '.cache', 'puppeteer');
};

// Get the executable path
const getExecutablePath = () => {
  // On Render, Puppeteer downloads to the cache directory
  if (process.env.RENDER) {
    return '/opt/render/.cache/puppeteer/chrome/linux-121.0.6167.85/chrome-linux64/chrome';
  }
  // For local development, use the default
  return puppeteer.executablePath();
};

// Create browser instance with proper configuration
const createBrowser = async () => {
  const cacheDir = getCacheDir();
  
  // Ensure the cache directory exists
  const fs = require('fs');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-webgl',
      '--disable-3d-apis',
      '--disable-audio-output',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-zygote',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
    executablePath: getExecutablePath(),
    userDataDir: path.join(cacheDir, 'user-data'),
  });
};

// Create a page with reasonable defaults
const createPage = async (browser) => {
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({
    width: 1200,
    height: 1600,
    deviceScaleFactor: 1,
  });

  // Set default timeout
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  return page;
};

module.exports = {
  createBrowser,
  createPage,
  getCacheDir,
  getExecutablePath,
};