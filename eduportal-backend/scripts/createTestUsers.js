// scripts/createTestUsers.js
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const PASSWORD = "Test@123"; // Simple password for all test accounts

async function main() {
  console.log("\n🌱 Seeding test users and school data...\n");

  // ─────────────────────────────────────────────
  // 1. GET OR CREATE SCHOOL
  // ─────────────────────────────────────────────
  let school = await prisma.school.findUnique({
    where: { slug: "test-academy-1234" },
  });

  if (!school) {
    school = await prisma.school.create({
      data: {
        name: "Test Academy",
        slug: "test-academy-1234",
        email: "admin@testacademy.com",
        region: "Greater Accra",
        district: "Accra Metro",
        address: "123 Test Street, Accra",
        phone: "+233 20 000 0000",
        status: "ACTIVE",
        plan: "PREMIUM",
      },
    });
    console.log("✅ Created school:", school.name);
  } else {
    console.log("✅ School already exists:", school.name);
  }

  // ─────────────────────────────────────────────
  // 2. GET OR CREATE ACTIVE TERM
  // ─────────────────────────────────────────────
  let term = await prisma.term.findFirst({
    where: { schoolId: school.id, status: "ACTIVE" },
  });

  if (!term) {
    // Check if any term exists, else create one
    const existingTerm = await prisma.term.findFirst({
      where: { schoolId: school.id },
    });
    if (existingTerm) {
      // Activate the first one
      term = await prisma.term.update({
        where: { id: existingTerm.id },
        data: { status: "ACTIVE" },
      });
    } else {
      term = await prisma.term.create({
        data: {
          schoolId: school.id,
          academicYear: "2025/2026",
          termNumber: "TERM1",
          startDate: new Date("2025-01-10"),
          endDate: new Date("2025-04-10"),
          status: "ACTIVE",
        },
      });
    }
    console.log("✅ Active term set:", term.academicYear, term.termNumber);
  } else {
    console.log("✅ Active term found:", term.academicYear);
  }

  // ─────────────────────────────────────────────
  // 3. GET OR CREATE CLASS (JHS1 A)
  // ─────────────────────────────────────────────
  let cls = await prisma.class.findFirst({
    where: {
      schoolId: school.id,
      level: "JHS1",
      section: "A",
      academicYear: "2025/2026",
    },
  });

  if (!cls) {
    cls = await prisma.class.create({
      data: {
        schoolId: school.id,
        level: "JHS1",
        section: "A",
        academicYear: "2025/2026",
      },
    });
    console.log("✅ Created class: JHS1 A");
  } else {
    console.log("✅ Class already exists: JHS1 A");
  }

  // ─────────────────────────────────────────────
  // 4. HELPERS
  // ─────────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 12);

  const createStaffUser = async (email, firstName, lastName, role) => {
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      console.log(`⏭️ User ${email} already exists. Skipping.`);
      return user;
    }

    user = await prisma.user.create({
      data: {
        schoolId: school.id,
        email,
        passwordHash: hash,
        role,
        isVerified: true,
        isActive: true,
      },
    });

    await prisma.staff.create({
      data: {
        userId: user.id,
        schoolId: school.id,
        firstName,
        lastName,
        phone: "+233 20 000 0000",
        gender: "MALE",
        staffNumber: `${role.substring(0, 3)}-${Date.now()}`,
      },
    });

    console.log(`✅ Created ${role}: ${firstName} ${lastName} (${email})`);
    return user;
  };

  // ─────────────────────────────────────────────
  // 5. CREATE SCHOOL ADMIN
  // ─────────────────────────────────────────────
  await createStaffUser(
    "schooladmin@test.com",
    "School",
    "Admin",
    "SCHOOL_ADMIN"
  );

  // ─────────────────────────────────────────────
  // 6. CREATE CLASS TEACHER
  // ─────────────────────────────────────────────
  await createStaffUser(
    "classteacher@test.com",
    "Class",
    "Teacher",
    "CLASS_TEACHER"
  );

  // ─────────────────────────────────────────────
  // 7. CREATE SUBJECT TEACHER
  // ─────────────────────────────────────────────
  await createStaffUser(
    "subjectteacher@test.com",
    "Subject",
    "Teacher",
    "SUBJECT_TEACHER"
  );

  // ─────────────────────────────────────────────
  // 8. CREATE STUDENT USER
  // ─────────────────────────────────────────────
  const studentEmail = "student@test.com";
  let studentUser = await prisma.user.findUnique({
    where: { email: studentEmail },
  });

  if (!studentUser) {
    studentUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        email: studentEmail,
        passwordHash: hash,
        role: "STUDENT",
        isVerified: true,
        isActive: true,
      },
    });
    console.log(`✅ Created STUDENT user: ${studentEmail}`);
  } else {
    console.log(`⏭️ Student user ${studentEmail} already exists.`);
  }

  // Create Student profile
  let student = await prisma.student.findUnique({
    where: { userId: studentUser.id },
  });

  if (!student) {
    student = await prisma.student.create({
      data: {
        schoolId: school.id,
        userId: studentUser.id,
        studentNumber: `STU-${Date.now()}`,
        firstName: "Test",
        lastName: "Student",
        gender: "MALE",
        dateOfBirth: new Date("2010-01-01"),
        status: "ACTIVE",
      },
    });
    console.log("✅ Created Student profile:", student.firstName, student.lastName);
  } else {
    console.log("⏭️ Student profile already exists.");
  }

  // Enroll student in class
  const existingEnrollment = await prisma.enrollment.findFirst({
    where: { studentId: student.id, termId: term.id },
  });

  if (!existingEnrollment) {
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classId: cls.id,
        termId: term.id,
      },
    });
    console.log("✅ Enrolled student in JHS1 A");
  } else {
    console.log("⏭️ Student already enrolled.");
  }

  // ─────────────────────────────────────────────
  // 9. CREATE PARENT USER & GUARDIAN
  // ─────────────────────────────────────────────
  const parentEmail = "parent@test.com";
  let parentUser = await prisma.user.findUnique({
    where: { email: parentEmail },
  });

  if (!parentUser) {
    parentUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        email: parentEmail,
        passwordHash: hash,
        role: "PARENT",
        isVerified: true,
        isActive: true,
      },
    });
    console.log(`✅ Created PARENT user: ${parentEmail}`);
  } else {
    console.log(`⏭️ Parent user ${parentEmail} already exists.`);
  }

  // Create Guardian record (linked to the student)
  let guardian = await prisma.guardian.findFirst({
    where: {
      schoolId: school.id,
      email: parentEmail,
    },
  });

  if (!guardian) {
    guardian = await prisma.guardian.create({
      data: {
        schoolId: school.id,
        firstName: "Test",
        lastName: "Parent",
        email: parentEmail,
        phone: "+233 20 111 1111",
        relationship: "Father",
      },
    });
    console.log("✅ Created Guardian profile:", guardian.firstName, guardian.lastName);
  } else {
    console.log("⏭️ Guardian already exists.");
  }

  // Link Guardian to Student
  const existingLink = await prisma.studentGuardian.findUnique({
    where: {
      studentId_guardianId: {
        studentId: student.id,
        guardianId: guardian.id,
      },
    },
  });

  if (!existingLink) {
    await prisma.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        isPrimary: true,
      },
    });
    console.log("✅ Linked Guardian to Student");
  } else {
    console.log("⏭️ Guardian already linked to Student.");
  }

  // ─────────────────────────────────────────────
  // 10. SUMMARY
  // ─────────────────────────────────────────────
  console.log("\n🎉 Seeding complete!\n");
  console.log("📋 Test Account Credentials (Password for all: `Test@123`):");
  console.log("  ─────────────────────────────────────────────");
  console.log(`  🛡️  SUPER_ADMIN   : eduportal@admin.com`);
  console.log(`  🏫 SCHOOL_ADMIN  : schooladmin@test.com`);
  console.log(`  👨‍🏫 CLASS_TEACHER : classteacher@test.com`);
  console.log(`  📚 SUBJECT_TEACHER: subjectteacher@test.com`);
  console.log(`  🧑‍🎓 STUDENT      : student@test.com`);
  console.log(`  👨‍👩‍👧 PARENT       : parent@test.com`);
  console.log("  ─────────────────────────────────────────────");
  console.log(`  🏫 School: ${school.name}`);
  console.log(`  📖 Class: JHS1 A`);
  console.log(`  📅 Term: ${term.academicYear} - ${term.termNumber}`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding test data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });