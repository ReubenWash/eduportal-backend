const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/document.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin, isSuperAdmin } = require("../middleware/roles");
const { uploadDocument } = require("../middleware/upload");

router.use(authenticate, tenantScope);

// Allow SUPER_ADMIN to access all document routes
router.post("/upload", isSuperAdmin, uploadDocument, controller.upload);
router.get("/",        isSuperAdmin, controller.list);
router.get("/:id",     isSuperAdmin, controller.getOne);
router.delete("/:id",  isSuperAdmin, controller.remove);

// Or if you want to allow both SUPER_ADMIN and SchoolStaff/SchoolAdmin:
// router.post("/upload", (req, res, next) => {
//   if (req.user?.role === 'SUPER_ADMIN') return next();
//   return isSchoolStaff(req, res, next);
// }, uploadDocument, controller.upload);

module.exports = router;