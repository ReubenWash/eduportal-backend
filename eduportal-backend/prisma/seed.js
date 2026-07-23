require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Create demo school ───────────────────────────────────────
  const existing = await prisma.school.findFirst({ where: { slug: "demo-school-seed" } });
  if (existing) {
    console.log("⚠️  Seed data already exists. Skipping.");
    return;
  }

  const school = await prisma.school.create({
    data: {
      name:     "Accra Academy JHS (Demo)",
      slug:     "demo-school-seed",
      email:    "demo@accraacademy.edu.gh",
      region:   "Greater Accra",
      district: "Accra Metro",
      address:  "Liberation Road, Accra",
      phone:    "+233244000000",
      motto:    "Excellence in Education",
      status:   "ACTIVE",
      plan:     "STANDARD",
    },
  });
  console.log(`✅ School created: ${school.name}`);

  // ── Create school admin user ─────────────────────────────────
  const passwordHash = await bcrypt.hash("Admin@1234", 12);
  const adminUser = await prisma.user.create({
    data: {
      schoolId:     school.id,
      email:        "admin@demo.edu.gh",
      passwordHash,
      role:         "SCHOOL_ADMIN",
      isVerified:   true,
    },
  });

  await prisma.staff.create({
    data: {
      userId:      adminUser.id,
      schoolId:    school.id,
      firstName:   "Kofi",
      lastName:    "Mensah",
      staffNumber: "HM-001",
      phone:       "+233244000001",
    },
  });
  console.log(`✅ Admin created: admin@demo.edu.gh / Admin@1234`);

  // ── Create class teacher ─────────────────────────────────────
  const teacherHash = await bcrypt.hash("Teacher@1234", 12);
  const teacherUser = await prisma.user.create({
    data: {
      schoolId:   school.id,
      email:      "teacher@demo.edu.gh",
      passwordHash: teacherHash,
      role:       "CLASS_TEACHER",
      isVerified: true,
    },
  });

  const teacher = await prisma.staff.create({
    data: {
      userId:      teacherUser.id,
      schoolId:    school.id,
      firstName:   "Ama",
      lastName:    "Boateng",
      staffNumber: "STF-2025-0001",
      phone:       "+233244000002",
    },
  });
  console.log(`✅ Teacher created: teacher@demo.edu.gh / Teacher@1234`);

  // ── Create academic term ─────────────────────────────────────
  const term = await prisma.term.create({
    data: {
      schoolId:    school.id,
      academicYear:"2024/2025",
      termNumber:  "TERM1",
      startDate:   new Date("2025-01-13"),
      endDate:     new Date("2025-04-04"),
      status:      "ACTIVE",
    },
  });
  console.log(`✅ Term created: ${term.academicYear} ${term.termNumber}`);

  // ── Create class ─────────────────────────────────────────────
  const jhs1a = await prisma.class.create({
    data: {
      schoolId:      school.id,
      level:         "JHS1",
      section:       "A",
      academicYear:  "2024/2025",
      classTeacherId: teacher.id,
    },
  });
  console.log(`✅ Class created: JHS 1A`);

  // ── Create subjects ──────────────────────────────────────────
  const subjectData = [
    { name: "English Language",  code: "ENG",  type: "CORE"     },
    { name: "Mathematics",        code: "MATH", type: "CORE"     },
    { name: "Integrated Science", code: "SCI",  type: "CORE"     },
    { name: "Social Studies",     code: "SOC",  type: "CORE"     },
    { name: "Religious & Moral",  code: "RME",  type: "CORE"     },
    { name: "Creative Arts",      code: "CA",   type: "ELECTIVE" },
    { name: "French",             code: "FRE",  type: "ELECTIVE" },
  ];

  const subjects = [];
  for (const s of subjectData) {
    const subject = await prisma.subject.create({ data: { schoolId: school.id, ...s } });
    await prisma.classSubject.create({ data: { classId: jhs1a.id, subjectId: subject.id } });
    subjects.push(subject);
  }
  console.log(`✅ ${subjects.length} subjects created and linked to JHS 1A`);

  // ── Create guardian ──────────────────────────────────────────
  const guardian = await prisma.guardian.create({
    data: {
      schoolId:     school.id,
      firstName:    "Kwame",
      lastName:     "Asante",
      phone:        "+233244111222",
      email:        "parent@demo.edu.gh",
      relationship: "Father",
    },
  });

  // ── Create demo students ─────────────────────────────────────
  const studentData = [
    { firstName: "Abena",  lastName: "Mensah",  gender: "FEMALE", dob: "2012-03-15" },
    { firstName: "Kweku",  lastName: "Asante",  gender: "MALE",   dob: "2012-07-22" },
    { firstName: "Efua",   lastName: "Boateng", gender: "FEMALE", dob: "2012-11-08" },
    { firstName: "Kofi",   lastName: "Agyei",   gender: "MALE",   dob: "2011-05-30" },
    { firstName: "Akosua", lastName: "Osei",    gender: "FEMALE", dob: "2012-09-14" },
  ];

  for (let i = 0; i < studentData.length; i++) {
    const d = studentData[i];
    const studentNumber = `JHS-2025-${String(i + 1).padStart(4, "0")}`;

    const student = await prisma.student.create({
      data: {
        schoolId,
        studentNumber,
        firstName:    d.firstName,
        lastName:     d.lastName,
        gender:       d.gender,
        dateOfBirth:  new Date(d.dob),
        admissionDate: new Date(),
      },
    });

    // Link guardian to first student
    if (i === 0) {
      await prisma.studentGuardian.create({
        data: { studentId: student.id, guardianId: guardian.id, isPrimary: true },
      });
    }

    // Enroll in JHS 1A for Term 1
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: jhs1a.id, termId: term.id },
    });
  }
  console.log(`✅ ${studentData.length} demo students created and enrolled in JHS 1A`);

  console.log("\n🎉 Seed complete!");
  console.log("─────────────────────────────────────────");
  console.log("School Admin → admin@demo.edu.gh / Admin@1234");
  console.log("Class Teacher → teacher@demo.edu.gh / Teacher@1234");
  console.log("─────────────────────────────────────────");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
