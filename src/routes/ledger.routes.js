const express = require("express");
const router = express.Router();
const controller = require("../controllers/ledger.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { isFinanceStaff } = require("../middleware/roles");
const { requirePermission } = require("../middleware/permission");

router.use(authenticate, tenantScope, isFinanceStaff);

router.get("/accounts",        requirePermission("view_ledger"), controller.listAccounts);
router.get("/balances",        requirePermission("view_ledger"), controller.getBalances);
router.get("/trial-balance",   requirePermission("view_ledger"), controller.getTrialBalance);
router.get("/daybook",         requirePermission("view_ledger"), controller.getDaybook);
router.get("/daybook/export",  requirePermission("view_ledger"), controller.exportDaybook);

module.exports = router;