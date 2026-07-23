const { prisma } = require("../config/db");
const guardianService = require("../services/guardian.service");
const { sendSuccess, sendError } = require("../utils/apiResponse");

const create    = async (req, res) => { const g = await guardianService.createGuardian(req.user.schoolId, req.body); return sendSuccess(res, 201, "Guardian created.", g); };
const list      = async (req, res) => { const r = await guardianService.getGuardians(req.user.schoolId, req.query); return sendSuccess(res, 200, "Guardians fetched.", r); };
const getOne    = async (req, res) => { const g = await guardianService.getGuardianById(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Guardian fetched.", g); };
const update    = async (req, res) => { const g = await guardianService.updateGuardian(req.user.schoolId, req.params.id, req.body); return sendSuccess(res, 200, "Guardian updated.", g); };
const linkStudent = async (req, res) => { const r = await guardianService.linkToStudent(req.user.schoolId, req.params.id, req.body.studentId, req.body.isPrimary); return sendSuccess(res, 200, "Linked to student.", r); };

// ✅ FIX: Guardian.email is not a @unique field, so findUnique({where:{email}})
// was invalid and would throw. Guardian has a proper userId @unique field
// (set at creation in guardian.service.js) — use that instead, scoped to
// this logged-in guardian's own record via their JWT.
const getMyChildren = async (req, res, next) => {
  try {
    const guardian = await prisma.guardian.findFirst({
      where: { userId: req.user.userId, schoolId: req.user.schoolId },
      include: {
        students: {
          include: {
            student: {
              include: {
                enrollments: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  include: { class: true }
                }
              }
            }
          }
        }
      }
    });

    if (!guardian) return sendError(res, 404, "Guardian profile not found.");

    const children = guardian.students.map(s => s.student);
    sendSuccess(res, 200, "Success", children);
  } catch (error) {
    next(error);
  }
};

// ✅ Also scope these to guardians actually linked to this student —
// otherwise any authenticated PARENT could pass any studentId in the URL
// and read another family's report cards/grades/attendance.
const assertOwnChild = async (guardianUserId, schoolId, studentId) => {
  const guardian = await prisma.guardian.findFirst({ where: { userId: guardianUserId, schoolId } });
  if (!guardian) return false;
  const link = await prisma.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
  });
  return !!link;
};

const getChildReportCards = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const allowed = await assertOwnChild(req.user.userId, req.user.schoolId, studentId);
    if (!allowed) return sendError(res, 403, "You are not linked to this student.");

    const reports = await prisma.report.findMany({
      where: { studentId, status: "RELEASED" },
      include: { term: true },
      orderBy: { createdAt: 'desc' }
    });
    sendSuccess(res, 200, "Success", reports);
  } catch (error) {
    next(error);
  }
};

const getChildGrades = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const allowed = await assertOwnChild(req.user.userId, req.user.schoolId, studentId);
    if (!allowed) return sendError(res, 403, "You are not linked to this student.");

    const scores = await prisma.score.findMany({
      where: { studentId },
      include: { subject: true, term: true }
    });
    sendSuccess(res, 200, "Success", scores);
  } catch (error) {
    next(error);
  }
};

const getChildAttendance = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const allowed = await assertOwnChild(req.user.userId, req.user.schoolId, studentId);
    if (!allowed) return sendError(res, 403, "You are not linked to this student.");

    const records = await prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: 'desc' }
    });

    const summary = { present: 0, absent: 0, late: 0, total: records.length };
    records.forEach(r => {
      if (r.status === 'PRESENT') summary.present++;
      else if (r.status === 'ABSENT') summary.absent++;
      else if (r.status === 'LATE') summary.late++;
    });

    sendSuccess(res, 200, "Success", { summary, records });
  } catch (error) {
    next(error);
  }
};

module.exports = { create, list, getOne, update, linkStudent, getMyChildren, getChildReportCards, getChildGrades, getChildAttendance };