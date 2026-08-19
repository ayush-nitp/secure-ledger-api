const { prisma } = require("../config/db");
const { z } = require("zod");
// Note: We are mocking the email service import. Ensure your email.service.js is updated later to not rely on Mongoose.
const emailService = require("../services/email.service"); 

const transactionSchema = z.object({
    fromAccount: z.string().uuid("Invalid sender account ID"),
    toAccount: z.string().uuid("Invalid receiver account ID"),
    amount: z.number().positive("Amount must be greater than zero").max(1000000, "Amount exceeds limits"),
    idempotencyKey: z.string().min(10, "Idempotency key required")
});

async function createTransaction(req, res) {
    try {
        const validatedData = transactionSchema.parse(req.body);
        const { fromAccount, toAccount, amount, idempotencyKey } = validatedData;
        const userId = req.user.id;

        // Execute atomic database transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Verify idempotency natively via unique constraint check on Transaction table
            const existingTx = await tx.transaction.findUnique({
                where: { idempotencyKey }
            });

            if (existingTx) {
                return { isDuplicate: true, transaction: existingTx };
            }

            // 2. Ensure the user owns the sender account
            const senderOwnership = await tx.account.findFirst({
                where: { id: fromAccount, userId: userId, status: 'ACTIVE' }
            });

            if (!senderOwnership) {
                throw new Error("UNAUTHORIZED_SENDER");
            }

            // 3. Atomically decrement sender (Conditional Update - prevents race conditions)
            // This query will fail if the balance drops below the amount, triggering a rollback.
            const sender = await tx.account.update({
                where: { 
                    id: fromAccount,
                    balance: { gte: amount }, // Concurrency lock: Balance must be >= amount at the exact microsecond of update
                    status: 'ACTIVE' 
                },
                data: { balance: { decrement: amount } }
            }).catch(() => {
                throw new Error("INSUFFICIENT_FUNDS_OR_INVALID_ACCOUNT");
            });

            // 4. Atomically increment receiver
            const receiver = await tx.account.update({
                where: { id: toAccount, status: 'ACTIVE' },
                data: { balance: { increment: amount } }
            }).catch(() => {
                throw new Error("INVALID_RECEIVER_ACCOUNT");
            });

            // 5. Create Transaction Record
            const transactionRecord = await tx.transaction.create({
                data: {
                    amount,
                    type: "TRANSFER",
                    status: "COMPLETED",
                    idempotencyKey
                }
            });

            // 6. Create Double-Entry Ledger Logs
            await tx.ledgerEntry.createMany({
                data: [
                    { transactionId: transactionRecord.id, accountId: fromAccount, amount, type: "DEBIT" },
                    { transactionId: transactionRecord.id, accountId: toAccount, amount, type: "CREDIT" }
                ]
            });

            // 7. Generate Immutable Audit Log
            await tx.auditLog.create({
                data: {
                    userId: userId,
                    action: "FUNDS_TRANSFERRED",
                    entityType: "TRANSACTION",
                    entityId: transactionRecord.id,
                    metadata: { amount, fromAccount, toAccount }
                }
            });

            return { isDuplicate: false, transaction: transactionRecord };
        });

        // Handle Idempotency Return
        if (result.isDuplicate) {
            return res.status(200).json({
                message: "Transaction already processed (Idempotency matched)",
                transaction: result.transaction
            });
        }

        // Email Service (Assuming it works asynchronously in the background)
        // await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount);

        return res.status(201).json({
            message: "Transaction completed successfully",
            transaction: result.transaction
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: error.errors } });
        }
        
        const errorMessage = error.message;
        if (errorMessage === "UNAUTHORIZED_SENDER") return res.status(403).json({ message: "You do not own this active account." });
        if (errorMessage === "INSUFFICIENT_FUNDS_OR_INVALID_ACCOUNT") return res.status(400).json({ message: "Insufficient funds or account inactive." });
        if (errorMessage === "INVALID_RECEIVER_ACCOUNT") return res.status(400).json({ message: "Receiver account invalid or inactive." });

        console.error("Transaction Error:", error);
        return res.status(500).json({ message: "Transaction failed and rolled back safely." });
    }
}

async function createInitialFundsTransaction(req, res) {
    try {
        const { toAccount, amount, idempotencyKey } = transactionSchema.omit({ fromAccount: true }).parse(req.body);
        const adminUserId = req.user.id;

        const result = await prisma.$transaction(async (tx) => {
            const existingTx = await tx.transaction.findUnique({ where: { idempotencyKey } });
            if (existingTx) return { isDuplicate: true, transaction: existingTx };

            // Find Admin's system account
            const adminAccount = await tx.account.findFirst({
                where: { userId: adminUserId, status: 'ACTIVE' }
            });

            if (!adminAccount) throw new Error("SYSTEM_ACCOUNT_NOT_FOUND");

            // Decrement admin, increment user
            await tx.account.update({
                where: { id: adminAccount.id },
                data: { balance: { decrement: amount } }
            });

            await tx.account.update({
                where: { id: toAccount, status: 'ACTIVE' },
                data: { balance: { increment: amount } }
            }).catch(() => { throw new Error("INVALID_RECEIVER"); });

            const transactionRecord = await tx.transaction.create({
                data: { amount, type: "DEPOSIT", status: "COMPLETED", idempotencyKey }
            });

            await tx.ledgerEntry.createMany({
                data: [
                    { transactionId: transactionRecord.id, accountId: adminAccount.id, amount, type: "DEBIT" },
                    { transactionId: transactionRecord.id, accountId: toAccount, amount, type: "CREDIT" }
                ]
            });

            await tx.auditLog.create({
                data: { userId: adminUserId, action: "INITIAL_FUNDS_MINTED", entityType: "TRANSACTION", entityId: transactionRecord.id }
            });

            return { isDuplicate: false, transaction: transactionRecord };
        });

        if (result.isDuplicate) return res.status(200).json({ message: "Already processed", transaction: result.transaction });

        return res.status(201).json({ message: "Initial funds injected successfully", transaction: result.transaction });
    } catch (error) {
        console.error("Initial Funds Error:", error);
        return res.status(500).json({ message: "Failed to process initial funds." });
    }
}

const getHistory = async (req, res) => {
    try {
        const userId = req.user.id; // Comes from authMiddleware
        
        // 1. Extract query parameters from the URL
        const { page = 1, limit = 10, status, startDate, endDate } = req.query;

        // 2. Calculate pagination variables
        const take = parseInt(limit);
        const skip = (parseInt(page) - 1) * take;

        // 3. Find all account IDs belonging to this user
        const userAccounts = await prisma.account.findMany({
            where: { userId: userId },
            select: { id: true }
        });
        const accountIds = userAccounts.map(account => account.id);

        if (accountIds.length === 0) {
            return res.status(200).json({ success: true, data: [], pagination: {} });
        }

        // 4. Build the dynamic WHERE clause for a Double-Entry system
        const whereClause = {
            ledgerEntries: {
                some: {
                    accountId: { in: accountIds }
                }
            }
        };

        // Add optional status filter
        if (status) {
            whereClause.status = status;
        }

        // Add optional date range filter
        if (startDate && endDate) {
            whereClause.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        // 5. Fetch the transactions with pagination and sorting
        const transactions = await prisma.transaction.findMany({
            where: whereClause,
            skip: skip,
            take: take,
            orderBy: { createdAt: 'desc' },
            include: {
                ledgerEntries: true // <--- This pulls the actual debits/credits into the JSON
            }
        });

        // 6. Get total count for frontend pagination math
        const total = await prisma.transaction.count({ where: whereClause });

        return res.status(200).json({
            success: true,
            data: transactions,
            pagination: {
                total,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / take),
                hasMore: skip + take < total
            }
        });

    } catch (error) {
        console.error("Transaction History Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getHistory
};