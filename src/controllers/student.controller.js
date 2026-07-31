const studentService = require("../services/student.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { uploadStudentPhoto } = require("../middleware/upload");
const { parseExcelBuffer, generateExcelBuffer, sendExcelFile } = require("../utils/excel");

const admit = async (req, res) => {
  try {
    const photoUrl = req.file?.path || null;
    const student = await studentService.admitStudent(req.user.schoolId, req.body, photoUrl);
    return sendSuccess(res, 201, "Student admitted successfully.", student);
  } catch (error) {
    console.error('Admit student error:', error);
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

const list = async (req, res) => {
  try {
    const result = await studentService.getStudents(req.user.schoolId, req.query);
    return sendSuccess(res, 200, "Students fetched.", result);
  } catch (error) {
    console.error('List students error:', error);
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

const getOne = async (req, res) => {
  try {
    const student = await studentService.getStudentById(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Student fetched.", student);
  } catch (error) {
    console.error('Get student error:', error);
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

const update = async (req, res) => {
  try {
    const photoUrl = req.file?.path || null;
    const student = await studentService.updateStudent(req.user.schoolId, req.params.id, req.body, photoUrl);
    return sendSuccess(res, 200, "Student updated.", student);
  } catch (error) {
    console.error('Update student error:', error);
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

const withdraw = async (req, res) => {
  try {
    await studentService.withdrawStudent(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Student withdrawn.");
  } catch (error) {
    console.error('Withdraw student error:', error);
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

const transfer = async (req, res) => {
  try {
    const student = await studentService.transferStudent(req.user.schoolId, req.params.id, req.body.destinationSchool);
    return sendSuccess(res, 200, "Student transferred.", student);
  } catch (error) {
    console.error('Transfer student error:', error);
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

const bulkImport = async (req, res) => {
  try {
    const result = await studentService.bulkImportStudents(req.user.schoolId, req.body.records || []);
    return sendSuccess(res, 200, "Bulk import complete.", result);
  } catch (error) {
    console.error('Bulk import error:', error);
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

const getReports = async (req, res) => {
  try {
    const reports = await studentService.getStudentReports(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Reports fetched.", reports);
  } catch (error) {
    console.error('Get reports error:', error);
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

const getTranscript = async (req, res) => {
  try {
    const transcript = await studentService.getStudentTranscript(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Transcript fetched.", transcript);
  } catch (error) {
    console.error('Get transcript error:', error);
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
    console.error('Get me error:', error);
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
    console.error('Get my report cards error:', error);
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
    console.error('Get my grades error:', error);
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

const importExcel = async (req, res) => {
  try {
    if (!req.file) {
      throw createError("No file uploaded. Expected a .xlsx file under field name 'file'.", 422);
    }
    const rows = await parseExcelBuffer(req.file.buffer);
    const result = await studentService.bulkImportStudentsFromExcelRows(req.user.schoolId, rows);
    return sendSuccess(res, 200, "Excel import completed.", result);
  } catch (error) {
    console.error('Import Excel error:', error);
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
      ],
      rows,
    });
    sendExcelFile(res, buffer, `students-export-${Date.now()}.xlsx`);
  } catch (error) {
    console.error('Export Excel error:', error);
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

// ─── NEW: Get all students for Super Admin ───
const getAllStudents = async (req, res) => {
  try {
    const students = await studentService.getAllStudents(req.query);
    return sendSuccess(res, 200, "All students fetched.", students);
  } catch (error) {
    console.error('Get all students error:', error);
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

module.exports = {
  admit,
  list,
  getOne,
  update,
  withdraw,
  transfer,
  bulkImport,
  getReports,
  getTranscript,
  getMe,
  getMyReportCards,
  getMyGrades,
  importExcel,
  exportExcel,
  getAllStudents // ← ADD THIS
};