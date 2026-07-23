require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const email = "eduportal@admin.com";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log("❌ User not found.");
    return;
  }
  console.log("✅ User found:", user.email);
  console.log("passwordHash:", user.passwordHash.substring(0, 20) + "...");
  // Test the password
  const password = "admin12@";
  const match = await bcrypt.compare(password, user.passwordHash);
  console.log("Password match:", match);
}
main().finally(() => prisma.$disconnect());