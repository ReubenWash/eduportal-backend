const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/document.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolAdmin } = require("../middleware/roles");
const { uploadDocument } = require("../middleware/upload");

// Apply authentication and tenant scope to all routes
router.use(authenticate, tenantScope);

// School admins manage their own school's documents (student/staff/guardian
// files); SUPER_ADMIN retains full cross-school access via isSchoolAdmin,
// which already allows both roles. This module was previously gated to
// SUPER_ADMIN only, which meant no school admin could ever reach it despite
// the service layer being fully school-scoped and ready for this.
router.post("/upload",       isSchoolAdmin, uploadDocument, controller.upload);
router.get("/",              isSchoolAdmin, controller.list);
router.post("/bulk-delete",  isSchoolAdmin, controller.bulkRemove);
router.get("/:id",           isSchoolAdmin, controller.getOne);
router.patch("/:id",         isSchoolAdmin, controller.update);
router.delete("/:id",        isSchoolAdmin, controller.remove);

module.exports = router;