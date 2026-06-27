const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/subject.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.use(authenticate, tenantScope);

router.get("/", isSchoolStaff, controller.list);

router.post("/",
  isSchoolAdmin,
  [
    body("name").trim().notEmpty().withMessage("Subject name is required."),
    body("code").trim().notEmpty().withMessage("Subject code is required."),
    body("type").isIn(["CORE","ELECTIVE"]).withMessage("Type must be CORE or ELECTIVE."),
  ],
  validate,
  controller.create
);

router.patch("/:id",  isSchoolAdmin, controller.update);
router.delete("/:id", isSchoolAdmin, controller.remove);

module.exports = router;
