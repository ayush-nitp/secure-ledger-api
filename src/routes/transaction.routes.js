const { Router } = require("express");
const { authMiddleware, authSystemUserMiddleware } = require("../middleware/auth.middleware");
const transactionController = require("../controllers/transaction.controller");

const transactionRoutes = Router();

/**
 * - POST /api/transactions/
 * - Create a new user-to-user transaction
 */
transactionRoutes.post("/", authMiddleware, transactionController.createTransaction);
transactionRoutes.get("/history", authMiddleware, transactionController.getHistory);
/**
 * - POST /api/transactions/system/initial-funds
 * - Create initial funds transaction from system user (Admin only)
 */
transactionRoutes.post("/system/initial-funds", authSystemUserMiddleware, transactionController.createInitialFundsTransaction);

module.exports = transactionRoutes;