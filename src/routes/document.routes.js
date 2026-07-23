const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/document.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { uploadDocument } = require("../middleware/upload");

router.use(authenticate, tenantScope);

router.post("/upload", isSchoolStaff, uploadDocument, controller.upload);
router.get("/",        isSchoolStaff, controller.list);
router.get("/:id",     isSchoolStaff, controller.getOne);
router.delete("/:id",  isSchoolAdmin, controller.remove);

module.exports = router;