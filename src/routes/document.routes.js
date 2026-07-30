const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/document.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSuperAdmin } = require("../middleware/roles");
const { uploadDocument } = require("../middleware/upload");

// Apply authentication and tenant scope to all routes
router.use(authenticate, tenantScope);

// SUPER_ADMIN has full access to all document operations
router.post("/upload", isSuperAdmin, uploadDocument, controller.upload);
router.get("/",        isSuperAdmin, controller.list);
router.get("/:id",     isSuperAdmin, controller.getOne);
router.delete("/:id",  isSuperAdmin, controller.remove);

module.exports = router;