const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const accountController = require("../controllers/account.controller");

const router = express.Router();

/**
 * @swagger
 * /api/v1/accounts:
 *   post:
 *     summary: Create a new account
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Main Wallet
 *               type:
 *                 type: string
 *                 example: ASSET
 *     responses:
 *       201:
 *         description: Account created successfully
 */
router.post("/", authMiddleware, accountController.createAccountController);

/**
 * @swagger
 * /api/v1/accounts:
 *   get:
 *     summary: Get all accounts of the logged-in user
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user accounts
 */
router.get("/", authMiddleware, accountController.getUserAccountsController);

/**
 * @swagger
 * /api/v1/accounts/balance/{accountId}:
 *   get:
 *     summary: Get balance of a specific account
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the account
 *     responses:
 *       200:
 *         description: Account balance retrieved
 */
router.get("/balance/:accountId", authMiddleware, accountController.getAccountBalanceController);

module.exports = router;