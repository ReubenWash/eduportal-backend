// scripts/fix-superadmin.js
// One-off diagnostic + password reset for a specific user.
// Run with: node scripts/fix-superadmin.js
//
// Make sure backend/.env's DATABASE_URL points at the SAME database
// your Render backend is using before you run this.

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const EMAIL = "atomosei16@gmail.com";
const NEW_PASSWORD = "NewPass@123"; // change this to whatever you want to log in with

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (!user) {
    console.log("❌ No user found with that email.");
    return;
  }

  console.log("✅ User found:");
  console.log("   id:         ", user.id);
  console.log("   email:      ", user.email);
  console.log("   role:       ", user.role);
  console.log("   isActive:   ", user.isActive);
  console.log("   isVerified: ", user.isVerified);

  if (!user.isActive || !user.isVerified) {
    console.log("\n⚠️  This is likely why login is failing (401/403).");
  }

  const newHash = await bcrypt.hash(NEW_PASSWORD, 12);

  await prisma.user.update({
    where: { email: EMAIL },
    data: {
      passwordHash: newHash,
      isActive: true,
      isVerified: true,
      mustChangePassword: false,
    },
  });

  console.log(`\n✅ Password reset. You can now log in with:`);
  console.log(`   email:    ${EMAIL}`);
  console.log(`   password: ${NEW_PASSWORD}`);
}

main()
  .catch((err) => console.error("Error:", err))
  .finally(() => prisma.$disconnect());