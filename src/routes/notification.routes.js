const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/notification.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolAdmin } = require("../middleware/roles");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.use(authenticate, tenantScope);

router.get("/",          controller.list);
router.post("/read-all", controller.readAll);

router.post("/device-token",
  [ body("token").trim().notEmpty().withMessage("Device token is required.") ],
  validate,
  controller.registerDeviceToken
);
router.delete("/device-token",
  [ body("token").trim().notEmpty().withMessage("Device token is required.") ],
  validate,
  controller.removeDeviceToken
);

router.patch("/:id/read",controller.markRead);
router.delete("/:id",    controller.remove);

router.post("/broadcast",
  isSchoolAdmin,
  [
    body("title").trim().notEmpty().withMessage("Title is required."),
    body("message").trim().notEmpty().withMessage("Message is required."),
    body("audience").isIn(["ALL","TEACHERS","PARENTS","STUDENTS"]).withMessage("Invalid audience."),
  ],
  validate,
  controller.broadcast
);

router.post("/mass-broadcast",
  (req, res, next) => {
    if (req.user.role !== "SUPER_ADMIN") return res.status(403).json({ success: false, message: "Forbidden" });
    next();
  },
  [
    body("title").trim().notEmpty().withMessage("Title is required."),
    body("message").trim().notEmpty().withMessage("Message is required."),
    body("audience").optional().custom((value, { req }) => {
      const allowed = ["ALL","TEACHERS","PARENTS","STUDENTS","SCHOOLS","ALL_SCHOOLS","PREMIUM_ONLY","BASIC_ONLY","ALL_TEACHERS","ALL_PARENTS","ALL_STUDENTS","SELECTED_SCHOOLS"];
      return value === undefined || allowed.includes(value) || (Array.isArray(req.body.selectedSchools) && value === "SELECTED_SCHOOLS");
    }).withMessage("Invalid audience."),
    body("selectedSchools").optional().isArray().withMessage("selectedSchools must be an array of school ids."),
  ],
  validate,
  controller.massBroadcast
);

module.exports = router;
