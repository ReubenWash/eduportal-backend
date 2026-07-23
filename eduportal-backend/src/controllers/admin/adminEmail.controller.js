const { prisma } = require("../../config/db");
const emailService = require("../../services/email.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// POST /api/v1/admin/emails/welcome
// ─────────────────────────────────────────────────────
const sendWelcomeEmail = async (req, res) => {
  const { schoolId } = req.body;
  if (!schoolId) throw createError("schoolId is required", 400);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw createError("School not found", 404);

  await emailService.sendSchoolWelcomeEmail(school.email, school.name);

  return sendSuccess(res, 200, `Welcome email sent to ${school.email}.`);
};

module.exports = { sendWelcomeEmail };
