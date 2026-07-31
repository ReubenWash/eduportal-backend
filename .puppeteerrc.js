// .puppeteerrc.js
const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Set the cache directory for Puppeteer
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  
  // Chrome download settings
  chrome: {
    skipDownload: false,
  },
};