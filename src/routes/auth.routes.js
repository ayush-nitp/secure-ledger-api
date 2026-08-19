const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = express.Router();

// Define the strict auth shield locally
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Max 10 attempts
    message: { success: false, message: "Too many authentication attempts, please try again later." }
});

/* POST /api/auth/register */
// Notice how authLimiter sits between the route and the controller
router.post("/register", authLimiter, authController.register);

/* POST /api/auth/login */
router.post("/login", authLimiter, authController.login);
router.get("/refresh", authController.refreshToken);

/* POST /api/auth/logout */
router.post("/logout", authMiddleware, authController.logout);

module.exports = router;