const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSchool() {
  try {
    // Get all schools with their statuses
    const schools = await prisma.school.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    console.log('📚 All Schools:');
    console.log('----------------------------------------');
    schools.forEach(s => {
      console.log(`ID: ${s.id}`);
      console.log(`Name: ${s.name}`);
      console.log(`Email: ${s.email}`);
      console.log(`Status: ${s.status}`);
      console.log(`Updated: ${s.updatedAt}`);
      console.log('----------------------------------------');
    });

    // Find specific school by email (replace with your email)
    const school = await prisma.school.findFirst({
      where: {
        email: 'YOUR_SCHOOL_EMAIL' // Replace with your school email
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        updatedAt: true
      }
    });

    if (school) {
      console.log('\n🎯 Found your school:');
      console.log(`ID: ${school.id}`);
      console.log(`Name: ${school.name}`);
      console.log(`Email: ${school.email}`);
      console.log(`Status: ${school.status}`);
      console.log(`Updated: ${school.updatedAt}`);
    } else {
      console.log('\n❌ School not found. Check your email.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchool();