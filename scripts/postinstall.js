const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('📦 Running postinstall script...');

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

const setup = async () => {
  console.log('🚀 Setting up project...');

  createDirectories();

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