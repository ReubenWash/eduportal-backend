// Super-admin billing: publish pay-to details, review proofs, approve/reject.
const express = require("express");
const router = express.Router();
const controller = require("../../controllers/billing.controller");
const authenticate = require("../../middleware/auth");
const { isSuperAdmin } = require("../../middleware/roles");

router.use(authenticate, isSuperAdmin);

router.get("/overview", controller.adminOverview);
router.get("/settings", controller.adminGetSettings);
router.put("/settings", controller.adminUpdateSettings);
router.get("/payments", controller.adminListPayments);
router.get("/payments/:id", controller.adminGetPayment);
router.get("/payments/:id/proof", controller.adminGetProof);
router.post("/payments/:id/approve", controller.adminApprove);
router.post("/payments/:id/reject", controller.adminReject);

module.exports = router;