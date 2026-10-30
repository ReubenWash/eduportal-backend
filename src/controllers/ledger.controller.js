const ledgerService = require("../services/ledger.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { generateExcelBuffer, sendExcelFile } = require("../utils/excel");

const getSchoolId = (req) => {
  const schoolId = req.user.schoolId;
  if (!schoolId) throw createError("No school associated with this account.", 400);
  return schoolId;
};

const listAccounts = async (req, res) => {
  const accounts = await ledgerService.getAccounts(getSchoolId(req), {
    includeInactive: req.query.includeInactive === "true",
  });
  return sendSuccess(res, 200, "Ledger accounts fetched.", accounts);
};

const getBalances = async (req, res) => {
  const balances = await ledgerService.getAccountBalances(getSchoolId(req));
  return sendSuccess(res, 200, "Account balances fetched.", balances);
};

const getTrialBalance = async (req, res) => {
  const tb = await ledgerService.getTrialBalance(getSchoolId(req));
  return sendSuccess(res, 200, "Trial balance fetched.", tb);
};

const getDaybook = async (req, res) => {
  const entries = await ledgerService.getDaybook(getSchoolId(req), req.query);
  return sendSuccess(res, 200, "Daybook fetched.", entries);
};

const exportDaybook = async (req, res) => {
  const entries = await ledgerService.getDaybook(getSchoolId(req), req.query);

  const rows = entries.map((e) => ({
    date: new Date(e.date).toISOString().slice(0, 10),
    account: e.account?.name || "",
    type: e.type,
    amount: Number(e.amount),
    category:
      e.financialCategory?.name || e.expenseCategory?.name || "",
    source: e.sourceType,
    description: e.description || "",
    recordedBy: e.recordedBy?.email || "",
  }));

  const buffer = await generateExcelBuffer({
    sheetName: "Daybook",
    columns: [
      { header: "Date", key: "date", width: 14 },
      { header: "Account", key: "account", width: 14 },
      { header: "Type", key: "type", width: 8 },
      { header: "Amount", key: "amount", width: 14 },
      { header: "Category", key: "category", width: 22 },
      { header: "Source", key: "source", width: 16 },
      { header: "Description", key: "description", width: 40 },
      { header: "Recorded By", key: "recordedBy", width: 24 },
    ],
    rows,
  });

  return sendExcelFile(res, buffer, `daybook-${Date.now()}.xlsx`);
};

module.exports = {
  listAccounts, getBalances, getTrialBalance, getDaybook, exportDaybook,
};