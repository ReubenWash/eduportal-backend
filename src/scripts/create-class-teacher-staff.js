// backend/src/scripts/create-class-teacher-staff.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createClassTeacherStaff() {
  try {
    const email = 'akwasib439@gmail.com';
    const schoolId = '850d9c8a-59fd-41bb-bc86-df88baf9b2fc';
    
    console.log('🔍 Looking for user:', email);
    
    // 1. Find the user
    const user = await prisma.user.findUnique({
      where: { email: email },
      include: { staff: true }
    });

    if (!user) {
      console.log('❌ User not found:', email);
      return;
    }

    console.log('✅ User found:', user.email);
    console.log('Has staff profile:', !!user.staff);

    // 2. If no staff profile, create one
    let staff;
    if (!user.staff) {
      console.log('📝 Creating staff profile...');
      staff = await prisma.staff.create({
        data: {
          userId: user.id,
          schoolId: schoolId,
          firstName: 'Akwasi',
          lastName: 'Boakye',
          staffNumber: `STF-${Date.now()}`,
          phone: '+233 24 000 0000',
        }
      });
      console.log('✅ Staff profile created:', staff.id);
    } else {
      staff = user.staff;
      console.log('✅ Staff profile already exists:', staff.id);
    }

    // 3. Find a class to assign the teacher to
    const classToAssign = await prisma.class.findFirst({
      where: { 
        schoolId: schoolId,
        classTeacherId: null // Only assign to a class without a teacher
      }
    });

    if (classToAssign) {
      console.log('📝 Assigning staff to class:', classToAssign.level, classToAssign.section);
      
      await prisma.class.update({
        where: { id: classToAssign.id },
        data: { classTeacherId: staff.id }
      });
      console.log('✅ Staff assigned to class:', classToAssign.level, classToAssign.section);
    } else {
      // If no class without a teacher, find any class
      const anyClass = await prisma.class.findFirst({
        where: { schoolId: schoolId }
      });
      
      if (anyClass) {
        console.log('📝 Assigning staff to existing class (overwriting):', anyClass.level, anyClass.section);
        
        await prisma.class.update({
          where: { id: anyClass.id },
          data: { classTeacherId: staff.id }
        });
        console.log('✅ Staff assigned to class:', anyClass.level, anyClass.section);
      } else {
        console.log('⚠️ No class found to assign. Please create a class first.');
      }
    }

    // 4. Verify the fix
    const updatedUser = await prisma.user.findUnique({
      where: { email: email },
      include: {
        staff: {
          include: {
            classesAsTeacher: true
          }
        }
      }
    });

    console.log('\n📊 Updated User:');
    console.log('Staff ID:', updatedUser.staff?.id);
    console.log('Assigned to class:', updatedUser.staff?.classesAsTeacher?.length > 0);
    console.log('Classes:', updatedUser.staff?.classesAsTeacher.map(c => `${c.level} ${c.section}`).join(', ') || 'None');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createClassTeacherStaff();