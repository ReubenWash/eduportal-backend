const operations = require("../services/school-operations.service");
const { sendSuccess } = require("../utils/apiResponse");

const listBooks = async (req, res) => sendSuccess(
  res, 200, "Library books fetched.", await operations.listBooks(req.user.schoolId, req.query.search || "")
);

const createBook = async (req, res) => sendSuccess(
  res, 201, "Book added to the library.", await operations.createBook(req.user.schoolId, req.body)
);

const updateBook = async (req, res) => sendSuccess(
  res, 200, "Book updated.", await operations.updateBook(req.user.schoolId, req.params.id, req.body)
);

const deleteBook = async (req, res) => {
  await operations.deleteBook(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Book removed from the library.");
};

const listTransportRoutes = async (req, res) => sendSuccess(
  res, 200, "Transport routes fetched.", await operations.listTransportRoutes(req.user.schoolId, req.query.search || "")
);

const createTransportRoute = async (req, res) => sendSuccess(
  res, 201, "Transport route created.", await operations.createTransportRoute(req.user.schoolId, req.body)
);

const updateTransportRoute = async (req, res) => sendSuccess(
  res, 200, "Transport route updated.", await operations.updateTransportRoute(req.user.schoolId, req.params.id, req.body)
);

const getPayroll = async (req, res) => sendSuccess(
  res, 200, "Payroll entries fetched.", await operations.listPayroll(req.user.schoolId, req.query.period)
);

const getPayrollStaff = async (req, res) => sendSuccess(
  res, 200, "Payroll staff fetched.", await operations.listPayrollStaff(req.user.schoolId)
);

const createPayrollEntry = async (req, res) => sendSuccess(
  res, 201, "Payroll entry created.", await operations.createPayrollEntry(req.user.schoolId, req.body)
);

const markPayrollPaid = async (req, res) => sendSuccess(
  res, 200, "Payroll entry marked as paid.", await operations.markPayrollPaid(req.user.schoolId, req.params.id)
);

const listAnnouncements = async (req, res) => sendSuccess(
  res, 200, "School announcements fetched.", await operations.listAnnouncements(req.user.schoolId)
);

const exportSchoolData = async (req, res) => {
  const data = await operations.exportSchoolData(req.user.schoolId);
  const filename = `${data.school.slug}-school-data-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(JSON.stringify(data, null, 2));
};

module.exports = {
  listBooks,
  createBook,
  updateBook,
  deleteBook,
  listTransportRoutes,
  createTransportRoute,
  updateTransportRoute,
  getPayroll,
  getPayrollStaff,
  createPayrollEntry,
  markPayrollPaid,
  listAnnouncements,
  exportSchoolData,
};
