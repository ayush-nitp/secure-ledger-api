const { Router } = require("express");
const { authMiddleware, authSystemUserMiddleware } = require("../middleware/auth.middleware");
const transactionController = require("../controllers/transaction.controller");

const transactionRoutes = Router();

/**
 * @swagger
 * /api/v1/transactions:
 *   post:
 *     summary: Create a new user-to-user transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fromAccountId:
 *                 type: string
 *               toAccountId:
 *                 type: string
 *               amount:
 *                 type: number
 *                 example: 500
 *               description:
 *                 type: string
 *                 example: Payment for lunch
 *     responses:
 *       201:
 *         description: Transaction successful
 */
transactionRoutes.post("/", authMiddleware, transactionController.createTransaction);
/**
 * @swagger
 * /api/v1/transactions/history:
 *   get:
 *     summary: Get transaction history for the user
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of transactions
 */
transactionRoutes.get("/history", authMiddleware, transactionController.getHistory);
/**
 * @swagger
 * /api/v1/transactions/system/initial-funds:
 *   post:
 *     summary: Create initial funds transaction (Admin only)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               toAccountId:
 *                 type: string
 *               amount:
 *                 type: number
 *                 example: 1000
 *     responses:
 *       201:
 *         description: Initial funds transferred successfully
 */
transactionRoutes.post("/system/initial-funds", authSystemUserMiddleware, transactionController.createInitialFundsTransaction);

module.exports = transactionRoutes;