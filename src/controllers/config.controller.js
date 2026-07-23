const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await prisma.globalSetting.findMany();
    const settingsObj = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.status(200).json({ success: true, data: settingsObj });
  } catch (error) {
    next(error);
  }
};

exports.getPublicSettings = async (req, res, next) => {
  try {
    const publicKeys = ['cms_landing', 'cms_pages'];
    const settings = await prisma.globalSetting.findMany({
      where: { key: { in: publicKeys } }
    });
    const settingsObj = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.status(200).json({ success: true, data: settingsObj });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid settings provided' });
    }

    const updates = Object.keys(settings).map(key => {
      return prisma.globalSetting.upsert({
        where: { key },
        update: { value: settings[key] },
        create: { key, value: settings[key] }
      });
    });

    await prisma.$transaction(updates);

    res.status(200).json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    next(error);
  }
};

exports.updateEnvConfig = async (req, res, next) => {
  try {
    const { keys } = req.body;
    
    if (!keys || typeof keys !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid keys provided' });
    }

    const envPath = path.join(__dirname, '../../.env');
    
    // Read existing .env
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update or append each key
    let lines = envContent.split('\n');
    Object.keys(keys).forEach(key => {
      const value = keys[key];
      const keyIndex = lines.findIndex(line => line.startsWith(`${key}=`));
      
      if (keyIndex >= 0) {
        // Replace existing
        lines[keyIndex] = `${key}=${value}`;
      } else {
        // Append new
        lines.push(`${key}=${value}`);
      }
    });

    // Write back to .env
    fs.writeFileSync(envPath, lines.join('\n'));

    // Note: Node.js process.env won't automatically update for running processes. 
    // You typically need to restart the server for new env vars to take full effect, 
    // though we can update process.env manually for immediate use:
    Object.keys(keys).forEach(key => {
      process.env[key] = keys[key];
    });

    res.status(200).json({ 
      success: true, 
      message: 'Configuration saved securely to .env',
      data: null
    });
  } catch (error) {
    next(error);
  }
};
