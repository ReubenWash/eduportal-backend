// src/controllers/student.controller.js
const { prisma } = require("../config/db");
const studentService = require("../services/student.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { uploadStudentPhoto } = require("../middleware/upload");
const { parseExcelBuffer, generateExcelBuffer, sendExcelFile } = require("../utils/excel");

// ─── Admit Student (with Guardian Portal Auto-Creation) ───
const admit = async (req, res) => {
  try {
    const photoUrl = req.file?.path || null;
    const result = await studentService.admitStudent(req.user.schoolId, req.body, photoUrl);
    
    return sendSuccess(res, 201, "Student admitted successfully.", {
      student: result.student,
      guardian: result.guardian ? {
        id: result.guardian.id,
        name: result.guardian.name,
        email: result.guardian.email,
        isNew: result.guardian.isNew,
        tempPassword: result.guardian.tempPassword || null,
        message: result.guardian.message,
      } : null,
      studentPortal: result.studentPortal || null,
      message: result.guardian?.isNew 
        ? `Student admitted. Guardian portal credentials sent to ${result.guardian.email}`
        : result.guardian 
          ? `Student admitted and linked to existing guardian: ${result.guardian.email}`
          : "Student admitted without guardian portal access.",
    });
  } catch (error) {
    console.error('❌ Admit student error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to admit student'
    });
  }
};

// ─── List Students ───
const list = async (req, res) => {
  try {
    const result = await studentService.getStudents(req.user.schoolId, req.query);
    return sendSuccess(res, 200, "Students fetched.", result);
  } catch (error) {
    console.error('❌ List students error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch students'
    });
  }
};

// ─── Get Single Student ───
const getOne = async (req, res) => {
  try {
    const student = await studentService.getStudentById(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Student fetched.", student);
  } catch (error) {
    console.error('❌ Get student error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch student'
    });
  }
};

// ─── Update Student ───
const update = async (req, res) => {
  try {
    const photoUrl = req.file?.path || null;
    const student = await studentService.updateStudent(req.user.schoolId, req.params.id, req.body, photoUrl);
    return sendSuccess(res, 200, "Student updated.", student);
  } catch (error) {
    console.error('❌ Update student error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update student'
    });
  }
};

// ─── Withdraw Student ───
const withdraw = async (req, res) => {
  try {
    await studentService.withdrawStudent(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Student withdrawn.");
  } catch (error) {
    console.error('❌ Withdraw student error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to withdraw student'
    });
  }
};

// ─── Transfer Student ───
const transfer = async (req, res) => {
  try {
    const student = await studentService.transferStudent(req.user.schoolId, req.params.id, req.body.destinationSchool);
    return sendSuccess(res, 200, "Student transferred.", student);
  } catch (error) {
    console.error('❌ Transfer student error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to transfer student'
    });
  }
};

// ─── Bulk Import ───
const bulkImport = async (req, res) => {
  try {
    const result = await studentService.bulkImportStudents(req.user.schoolId, req.body.records || []);
    return sendSuccess(res, 200, "Bulk import complete.", result);
  } catch (error) {
    console.error('❌ Bulk import error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to bulk import'
    });
  }
};

// ─── Get Student Reports ───
const getReports = async (req, res) => {
  try {
    const reports = await studentService.getStudentReports(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Reports fetched.", reports);
  } catch (error) {
    console.error('❌ Get reports error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch reports'
    });
  }
};

// ─── Get Student Transcript ───
const getTranscript = async (req, res) => {
  try {
    const transcript = await studentService.getStudentTranscript(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Transcript fetched.", transcript);
  } catch (error) {
    console.error('❌ Get transcript error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch transcript'
    });
  }
};

// ─── Student Self-Service ───
const getMe = async (req, res) => {
  try {
    const student = await studentService.getStudentByUserId(req.user.userId, req.user.schoolId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found."
      });
    }
    return sendSuccess(res, 200, "Student profile fetched.", student);
  } catch (error) {
    console.error('❌ Get me error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch profile'
    });
  }
};

const getMyReportCards = async (req, res) => {
  try {
    const student = await studentService.getStudentByUserId(req.user.userId, req.user.schoolId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found."
      });
    }
    const reports = await studentService.getStudentReports(student.id);
    return sendSuccess(res, 200, "Report cards fetched.", reports);
  } catch (error) {
    console.error('❌ Get my report cards error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch report cards'
    });
  }
};

const getMyGrades = async (req, res) => {
  try {
    const student = await studentService.getStudentByUserId(req.user.userId, req.user.schoolId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found."
      });
    }
    const grades = await studentService.getStudentGrades(student.id);
    return sendSuccess(res, 200, "Grades fetched.", grades);
  } catch (error) {
    console.error('❌ Get my grades error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch grades'
    });
  }
};

// ─── Excel Import/Export ───
const importExcel = async (req, res) => {
  try {
    if (!req.file) {
      throw createError("No file uploaded. Expected a .xlsx file under field name 'file'.", 422);
    }
    const rows = await parseExcelBuffer(req.file.buffer);
    const result = await studentService.bulkImportStudentsFromExcelRows(req.user.schoolId, rows);
    return sendSuccess(res, 200, "Excel import completed.", result);
  } catch (error) {
    console.error('❌ Import Excel error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to import Excel'
    });
  }
};

const exportExcel = async (req, res) => {
  try {
    const rows = await studentService.getStudentsForExport(req.user.schoolId, req.query);
    const buffer = await generateExcelBuffer({
      sheetName: "Students",
      columns: [
        { header: "Student No.", key: "studentNumber", width: 18 },
        { header: "First Name", key: "firstName", width: 18 },
        { header: "Last Name", key: "lastName", width: 18 },
        { header: "Other Names", key: "otherNames", width: 16 },
        { header: "Gender", key: "gender", width: 10 },
        { header: "Date of Birth", key: "dateOfBirth", width: 14 },
        { header: "Class", key: "class", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Admission Date", key: "admissionDate", width: 16 },
        { header: "Guardian Name", key: "guardianName", width: 20 },
        { header: "Guardian Email", key: "guardianEmail", width: 24 },
        { header: "Guardian Phone", key: "guardianPhone", width: 16 },
        { header: "Relationship", key: "guardianRelationship", width: 14 },
      ],
      rows,
    });
    sendExcelFile(res, buffer, `students-export-${Date.now()}.xlsx`);
  } catch (error) {
    console.error('❌ Export Excel error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to export Excel'
    });
  }
};

// ─── Get all students for Super Admin ───
const getAllStudents = async (req, res) => {
  try {
    const students = await studentService.getAllStudents(req.query);
    return sendSuccess(res, 200, "All students fetched.", students);
  } catch (error) {
    console.error('❌ Get all students error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch all students'
    });
  }
};

// ─── Link Existing Guardian to Student ───
const linkGuardian = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { guardianEmail } = req.body;

    if (!guardianEmail) {
      throw createError("Guardian email is required.", 400);
    }

    const result = await studentService.linkGuardianToStudent(
      req.user.schoolId,
      studentId,
      guardianEmail
    );

    return sendSuccess(res, 200, result.message, result);
  } catch (error) {
    console.error('❌ Link guardian error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to link guardian'
    });
  }
};

// ─── Resend Guardian Portal Credentials ───
const resendGuardianCredentials = async (req, res) => {
  try {
    const { guardianId } = req.params;

    const result = await studentService.resendGuardianCredentials(
      req.user.schoolId,
      guardianId
    );

    return sendSuccess(res, 200, result.message, result);
  } catch (error) {
    console.error('❌ Resend guardian credentials error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend credentials'
    });
  }
};

// ─── Get Guardian's Children ───
const getGuardianChildren = async (req, res) => {
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

    if (!guardian) {
      return res.status(404).json({
        success: false,
        message: "Guardian profile not found."
      });
    }

    const children = guardian.students.map(s => s.student);
    return sendSuccess(res, 200, "Children fetched.", children);
  } catch (error) {
    console.error('❌ Get guardian children error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch children'
    });
  }
};

// ════════════════════════════════════════════════════════
// ─── NEW: GUARDIAN CHILD DETAILS (for Parent Portal) ───
// ════════════════════════════════════════════════════════

// ─── Get Child Report Cards ───
const getChildReportCards = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Verify guardian has access to this student
    const guardian = await prisma.guardian.findFirst({
      where: { userId: req.user.userId, schoolId: req.user.schoolId },
      include: {
        students: {
          where: { studentId },
        },
      },
    });

    if (!guardian || guardian.students.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this student's records.",
      });
    }

    const reports = await prisma.report.findMany({
      where: {
        studentId,
        status: "RELEASED",
      },
      include: {
        term: {
          select: {
            id: true,
            academicYear: true,
            termNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Format reports for frontend
    const formattedReports = reports.map(report => ({
      id: report.id,
      termName: `${report.term.academicYear} - ${report.term.termNumber.replace('TERM', 'Term ')}`,
      termId: report.term.id,
      academicYear: report.term.academicYear,
      termNumber: report.term.termNumber,
      classPosition: report.classPosition,
      totalStudents: report.totalStudents,
      aggregate: report.aggregate,
      teacherRemark: report.teacherRemark,
      headRemark: report.headRemark,
      daysPresent: report.daysPresent,
      daysAbsent: report.daysAbsent,
      daysLate: report.daysLate,
      totalSchoolDays: report.totalSchoolDays,
      pdfUrl: report.pdfUrl,
      status: report.status,
      releasedAt: report.releasedAt,
      createdAt: report.createdAt,
    }));

    return sendSuccess(res, 200, "Report cards fetched.", formattedReports);
  } catch (error) {
    console.error('❌ Get child report cards error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch report cards',
    });
  }
};

// ─── Get Child Grades ───
const getChildGrades = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Verify guardian has access to this student
    const guardian = await prisma.guardian.findFirst({
      where: { userId: req.user.userId, schoolId: req.user.schoolId },
      include: {
        students: {
          where: { studentId },
        },
      },
    });

    if (!guardian || guardian.students.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this student's records.",
      });
    }

    const scores = await prisma.score.findMany({
      where: { studentId },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
          },
        },
        term: {
          select: {
            id: true,
            academicYear: true,
            termNumber: true,
          },
        },
      },
      orderBy: [
        { term: { academicYear: "desc" } },
        { term: { termNumber: "desc" } },
        { subject: { name: "asc" } },
      ],
    });

    // Group by term
    const groupedScores = scores.reduce((acc, score) => {
      const termKey = `${score.term.academicYear}-${score.term.termNumber}`;
      if (!acc[termKey]) {
        acc[termKey] = {
          term: score.term,
          scores: [],
        };
      }
      acc[termKey].scores.push(score);
      return acc;
    }, {});

    const result = Object.values(groupedScores).map((group) => ({
      term: {
        id: group.term.id,
        academicYear: group.term.academicYear,
        termNumber: group.term.termNumber,
        termLabel: `${group.term.academicYear} - ${group.term.termNumber.replace('TERM', 'Term ')}`,
      },
      subjects: group.scores.map(s => ({
        id: s.id,
        subjectId: s.subjectId,
        subjectName: s.subject.name,
        subjectCode: s.subject.code,
        subjectType: s.subject.type,
        ca1: s.ca1,
        ca2: s.ca2,
        ca3: s.ca3,
        caTotal: s.caTotal,
        examScore: s.examScore,
        total: s.total,
        grade: s.grade,
        remark: s.remark,
        position: s.position,
      })),
      average: group.scores.length > 0
        ? Math.round(group.scores.reduce((sum, s) => sum + (s.total || 0), 0) / group.scores.length)
        : 0,
    }));

    return sendSuccess(res, 200, "Grades fetched.", result);
  } catch (error) {
    console.error('❌ Get child grades error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch grades',
    });
  }
};

// ─── Get Child Attendance ───
const getChildAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { termId } = req.query;
    
    // Verify guardian has access to this student
    const guardian = await prisma.guardian.findFirst({
      where: { userId: req.user.userId, schoolId: req.user.schoolId },
      include: {
        students: {
          where: { studentId },
        },
      },
    });

    if (!guardian || guardian.students.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this student's records.",
      });
    }

    const where = { studentId };
    if (termId) {
      where.termId = termId;
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        term: {
          select: {
            id: true,
            academicYear: true,
            termNumber: true,
          },
        },
      },
    });

    // Calculate summary
    const summary = {
      total: records.length,
      present: records.filter((r) => r.status === "PRESENT").length,
      absent: records.filter((r) => r.status === "ABSENT").length,
      late: records.filter((r) => r.status === "LATE").length,
      excused: records.filter((r) => r.status === "EXCUSED").length,
    };

    // Group by term
    const groupedRecords = records.reduce((acc, record) => {
      const termKey = `${record.term.academicYear}-${record.term.termNumber}`;
      if (!acc[termKey]) {
        acc[termKey] = {
          term: record.term,
          records: [],
        };
      }
      acc[termKey].records.push(record);
      return acc;
    }, {});

    const termSummaries = Object.values(groupedRecords).map((group) => ({
      term: {
        id: group.term.id,
        academicYear: group.term.academicYear,
        termNumber: group.term.termNumber,
        termLabel: `${group.term.academicYear} - ${group.term.termNumber.replace('TERM', 'Term ')}`,
      },
      summary: {
        total: group.records.length,
        present: group.records.filter((r) => r.status === "PRESENT").length,
        absent: group.records.filter((r) => r.status === "ABSENT").length,
        late: group.records.filter((r) => r.status === "LATE").length,
        excused: group.records.filter((r) => r.status === "EXCUSED").length,
      },
      records: group.records.map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        note: r.note,
      })),
    }));

    return sendSuccess(res, 200, "Attendance fetched.", {
      summary,
      byTerm: termSummaries,
      records: records.map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        note: r.note,
        term: r.term,
      })),
    });
  } catch (error) {
    console.error('❌ Get child attendance error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch attendance',
    });
  }
};

// ════════════════════════════════════════════════════════
// ─── SUPER ADMIN ENDPOINTS ─────────────────────────────
// ════════════════════════════════════════════════════════

// ─── Get Student by ID (Super Admin) ───
const getStudentById = async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        school: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            isVerified: true,
          },
        },
        guardians: {
          include: {
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                relationship: true,
                user: {
                  select: {
                    email: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
        enrollments: {
          include: {
            class: {
              select: {
                level: true,
                section: true,
              },
            },
            term: {
              select: {
                academicYear: true,
                termNumber: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            scores: true,
            attendances: true,
            reports: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    return sendSuccess(res, 200, "Student fetched.", student);
  } catch (error) {
    console.error('❌ Get student by ID error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch student',
    });
  }
};

// ════════════════════════════════════════════════════════
// ─── EXPORTS ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════

module.exports = {
  // Core CRUD
  admit,
  list,
  getOne,
  update,
  withdraw,
  transfer,
  bulkImport,
  
  // Reports & Transcripts
  getReports,
  getTranscript,
  
  // Student Self-Service
  getMe,
  getMyReportCards,
  getMyGrades,
  
  // Excel Import/Export
  importExcel,
  exportExcel,
  
  // Super Admin
  getAllStudents,
  getStudentById,
  
  // Guardian Portal
  linkGuardian,
  resendGuardianCredentials,
  getGuardianChildren,
  getChildReportCards,
  getChildGrades,
  getChildAttendance,
};