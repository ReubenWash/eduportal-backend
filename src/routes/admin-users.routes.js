const express = require("express");
const router = express.Router();
const controller = require("../controllers/admin-users.controller");
const authenticate = require("../middleware/auth");
const { isSuperAdmin } = require("../middleware/roles");

// All routes require authentication and SUPER_ADMIN role
router.use(authenticate, isSuperAdmin);

// ─── User Management ──
router.get("/", controller.getAllUsers);
router.get("/:id", controller.getUserById);
router.post("/", controller.addUser);
router.patch("/:id", controller.updateUser);
router.patch("/:id/status", controller.updateUserStatus);
router.delete("/:id", controller.deleteUser);

// ─── User Verification ──
router.patch("/:userId/verify", controller.verifyUser);
router.post("/school/:schoolId/verify-all", controller.verifyAllUsersBySchool);

module.exports = router;