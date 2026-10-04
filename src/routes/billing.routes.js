// School-admin billing: view what's due, pay manually, upload proof, track status.
const express = require("express");
const router = express.Router();
const controller = require("../controllers/billing.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { authorize } = require("../middleware/roles");
const { uploadPaymentProof } = require("../middleware/uploadPaymentProof");
const { publicLimiter } = require("../middleware/rateLimiter");

router.use(authenticate, tenantScope, authorize("SCHOOL_ADMIN"));

router.get("/summary", controller.getSummary);
router.get("/payments", controller.listPayments);
router.post("/payments", publicLimiter, uploadPaymentProof, controller.submitPayment);
router.get("/payments/:id", controller.getPayment);
router.get("/payments/:id/proof", controller.getProof);

module.exports = router;