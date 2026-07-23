const express = require("express");
const router = express.Router();
const controller = require("../controllers/admin-users.controller");
const authenticate = require("../middleware/auth");
const { isSuperAdmin } = require("../middleware/roles");

router.use(authenticate, isSuperAdmin);

router.get("/", controller.getAllUsers);
router.post("/", controller.addUser);
router.patch("/:id/status", controller.updateUserStatus);
router.delete("/:id", controller.deleteUser);

// ─── NEW: Super Admin manually verify a user ───────────────────
router.patch("/:userId/verify", controller.verifyUser);

module.exports = router;