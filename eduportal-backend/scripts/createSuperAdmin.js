/**
 * One-time script to create the platform Super Admin
 * Run: node scripts/createSuperAdmin.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   EduTrack JHS — Super Admin Setup       ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const email    = await ask("Super Admin email:    ");
  const password = await ask("Super Admin password: ");
  rl.close();

  if (!email || !password) {
    console.error("❌ Email and password are required.");
    process.exit(1);
  }

  // Check not already created
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.error("❌ A user with this email already exists.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      schoolId:     null,
      email,
      passwordHash,
      role:         "SUPER_ADMIN",
      isVerified:   true,
      isActive:     true,
    },
  });

  console.log("\n✅ Super Admin created successfully!");
  console.log(`   Email: ${user.email}`);
  console.log(`   Role:  ${user.role}`);
  console.log(`   ID:    ${user.id}\n`);
}

main()
  .catch((e) => { console.error("Error:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
