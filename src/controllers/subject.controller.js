const subjectService = require("../services/subject.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { prisma } = require("../config/db");

// ─── Create Subject ───
const create = async (req, res) => {
  try {
    const s = await subjectService.createSubject(req.user.schoolId, req.body);
    return sendSuccess(res, 201, "Subject created.", s);
  } catch (error) {
    console.error("❌ Create subject error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create subject",
    });
  }
};

// ─── List Subjects ───
const list = async (req, res) => {
  try {
    // ✅ Get subjects with teacher and class counts
    const subjects = await prisma.subject.findMany({
      where: { schoolId: req.user.schoolId },
      include: {
        staffSubjects: {
          select: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              }
            },
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        },
        classSubjects: {
          select: {
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        }
      },
      orderBy: { name: "asc" },
    });

    // ✅ Format response with counts
    const formattedSubjects = subjects.map(subject => ({
      ...subject,
      teachers: subject.staffSubjects.map(ss => ss.staff),
      teacherCount: subject.staffSubjects.length,
      classes: subject.classSubjects.map(cs => cs.class),
      classCount: subject.classSubjects.length,
    }));

    return sendSuccess(res, 200, "Subjects fetched successfully", formattedSubjects);
  } catch (error) {
    console.error("❌ List subjects error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch subjects",
    });
  }
};

// ─── Get Single Subject ───
const getOne = async (req, res) => {
  try {
    const subject = await prisma.subject.findFirst({
      where: {
        id: req.params.id,
        schoolId: req.user.schoolId,
      },
      include: {
        staffSubjects: {
          include: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              }
            },
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        },
        classSubjects: {
          include: {
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        }
      },
    });

    if (!subject) {
      throw createError("Subject not found", 404);
    }

    return sendSuccess(res, 200, "Subject fetched successfully", subject);
  } catch (error) {
    console.error("❌ Get subject error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch subject",
    });
  }
};

// ─── Update Subject ───
const update = async (req, res) => {
  try {
    const s = await subjectService.updateSubject(req.user.schoolId, req.params.id, req.body);
    return sendSuccess(res, 200, "Subject updated.", s);
  } catch (error) {
    console.error("❌ Update subject error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update subject",
    });
  }
};

// ─── Delete Subject ───
const remove = async (req, res) => {
  try {
    await subjectService.deleteSubject(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Subject deleted.");
  } catch (error) {
    console.error("❌ Delete subject error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete subject",
    });
  }
};

module.exports = { create, list, getOne, update, remove };