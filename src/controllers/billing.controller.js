const billing = require("../services/billing.service");
const { sendSuccess } = require("../utils/apiResponse");

const streamProof = async (res, file) => {
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  file.stream.on("error", () => res.destroy());
  file.stream.pipe(res);
};

// ── School admin ───────────────────────────────────────────────
exports.getSummary = async (req, res) =>
  sendSuccess(res, 200, "Billing summary", await billing.getSchoolBilling(req.user.schoolId));

exports.submitPayment = async (req, res) =>
  sendSuccess(res, 201, "Payment proof submitted. We will confirm by email once verified.",
    await billing.submitPayment(req.user, req.body, req.file));

exports.listPayments = async (req, res) =>
  sendSuccess(res, 200, "Payments", await billing.listSchoolPayments(req.user.schoolId, req.query));

exports.getPayment = async (req, res) =>
  sendSuccess(res, 200, "Payment", await billing.getSchoolPayment(req.user.schoolId, req.params.id));

exports.getProof = async (req, res) =>
  streamProof(res, await billing.getProofFile({ id: req.params.id, schoolId: req.user.schoolId }));

// ── Super admin ────────────────────────────────────────────────
exports.adminGetSettings = async (req, res) =>
  sendSuccess(res, 200, "Billing settings", await billing.getSettingsView());

exports.adminUpdateSettings = async (req, res) =>
  sendSuccess(res, 200, "Billing settings updated", await billing.updateSettings(req.user.userId, req.body));

exports.adminOverview = async (req, res) =>
  sendSuccess(res, 200, "Billing overview", await billing.getOverview());

exports.adminListPayments = async (req, res) =>
  sendSuccess(res, 200, "Payments", await billing.listPayments(req.query));

exports.adminGetPayment = async (req, res) =>
  sendSuccess(res, 200, "Payment", await billing.getPayment(req.params.id));

exports.adminGetProof = async (req, res) =>
  streamProof(res, await billing.getProofFile({ id: req.params.id }));

exports.adminApprove = async (req, res) =>
  sendSuccess(res, 200, "Payment approved", await billing.approvePayment(req.params.id, req.user.userId, req.body));

exports.adminReject = async (req, res) =>
  sendSuccess(res, 200, "Payment rejected", await billing.rejectPayment(req.params.id, req.user.userId, req.body));