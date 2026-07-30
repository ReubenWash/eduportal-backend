// scripts/test-class.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    console.log('Testing Class operations...');
    
    // Check if table exists
    const count = await prisma.class.count();
    console.log('Total classes in database:', count);
    
    // Get first class
    const sample = await prisma.class.findFirst();
    console.log('Sample class:', sample);
    
    // Check schools
    const schools = await prisma.school.findMany({
      select: { id: true, name: true }
    });
    console.log('Schools:', schools);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();