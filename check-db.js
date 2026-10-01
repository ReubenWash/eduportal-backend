const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.user.count();

  console.log('USER COUNT:', count);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  console.log('USERS:', users);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });