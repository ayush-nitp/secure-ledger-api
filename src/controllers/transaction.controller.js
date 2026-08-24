const { prisma } = require("../config/db");
const { transactionSchema } = require("../validators/transaction.validator");
const emailService = require("../services/email.service"); 

// Naye imports jo humne Clean Architecture ke liye banaye hain
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const createTransaction = asyncHandler(async (req, res) => {
    const validatedData = transactionSchema.parse(req.body);
    const { fromAccount, toAccount, amount, idempotencyKey } = validatedData;
    const userId = req.user.id;

    // Execute atomic database transaction
    const result = await prisma.$transaction(async (tx) => {
        // 1. Verify idempotency
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
            throw new ApiError(403, "You do not own this active account.", "UNAUTHORIZED_SENDER");
        }

        // 3. Atomically decrement sender
        await tx.account.update({
            where: { 
                id: fromAccount,
                balance: { gte: amount },
                status: 'ACTIVE' 
            },
            data: { balance: { decrement: amount } }
        }).catch(() => {
            throw new ApiError(400, "Insufficient funds or account inactive.", "INSUFFICIENT_FUNDS_OR_INVALID_ACCOUNT");
        });

        // 4. Atomically increment receiver
        await tx.account.update({
            where: { id: toAccount, status: 'ACTIVE' },
            data: { balance: { increment: amount } }
        }).catch(() => {
            throw new ApiError(400, "Receiver account invalid or inactive.", "INVALID_RECEIVER_ACCOUNT");
        });

        // 5. Create Transaction Record
        const transactionRecord = await tx.transaction.create({
            data: { amount, type: "TRANSFER", status: "COMPLETED", idempotencyKey }
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
        return res.status(200).json(
            new ApiResponse(200, result.transaction, "Transaction already processed (Idempotency matched)")
        );
    }

    return res.status(201).json(
        new ApiResponse(201, result.transaction, "Transaction completed successfully")
    );
});

const createInitialFundsTransaction = asyncHandler(async (req, res) => {
    const { toAccount, amount, idempotencyKey } = transactionSchema.omit({ fromAccount: true }).parse(req.body);
    const adminUserId = req.user.id;

    const result = await prisma.$transaction(async (tx) => {
        const existingTx = await tx.transaction.findUnique({ where: { idempotencyKey } });
        if (existingTx) return { isDuplicate: true, transaction: existingTx };

        // Find Admin's system account
        const adminAccount = await tx.account.findFirst({
            where: { userId: adminUserId, status: 'ACTIVE' }
        });

        if (!adminAccount) throw new ApiError(404, "SYSTEM_ACCOUNT_NOT_FOUND", "SYSTEM_ACCOUNT_NOT_FOUND");

        // Decrement admin, increment user
        await tx.account.update({
            where: { id: adminAccount.id },
            data: { balance: { decrement: amount } }
        });

        await tx.account.update({
            where: { id: toAccount, status: 'ACTIVE' },
            data: { balance: { increment: amount } }
        }).catch(() => { throw new ApiError(400, "INVALID_RECEIVER", "INVALID_RECEIVER"); });

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

    if (result.isDuplicate) {
        return res.status(200).json(new ApiResponse(200, result.transaction, "Already processed"));
    }

    return res.status(201).json(new ApiResponse(201, result.transaction, "Initial funds injected successfully"));
});

const getHistory = asyncHandler(async (req, res) => {
    const userId = req.user.id; 
    
    // 1. Extract query parameters
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    const take = parseInt(limit);
    const skip = (parseInt(page) - 1) * take;

    // 2. Find all account IDs belonging to this user
    const userAccounts = await prisma.account.findMany({
        where: { userId: userId },
        select: { id: true }
    });
    const accountIds = userAccounts.map(account => account.id);

    if (accountIds.length === 0) {
        return res.status(200).json(new ApiResponse(200, { data: [], pagination: {} }, "No accounts found"));
    }

    // 3. Build dynamic WHERE clause
    const whereClause = {
        ledgerEntries: {
            some: {
                accountId: { in: accountIds }
            }
        }
    };

    if (status) whereClause.status = status;
    if (startDate && endDate) {
        whereClause.createdAt = {
            gte: new Date(startDate),
            lte: new Date(endDate)
        };
    }

    // 4. Fetch transactions
    const transactions = await prisma.transaction.findMany({
        where: whereClause,
        skip: skip,
        take: take,
        orderBy: { createdAt: 'desc' },
        include: {
            ledgerEntries: true
        }
    });

    // 5. Get total count
    const total = await prisma.transaction.count({ where: whereClause });

    const responseData = {
        transactions,
        pagination: {
            total,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / take),
            hasMore: skip + take < total
        }
    };

    return res.status(200).json(new ApiResponse(200, responseData, "History fetched successfully"));
});

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getHistory
};