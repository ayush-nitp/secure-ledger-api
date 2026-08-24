const { prisma } = require("../config/db");
const { logAction } = require("../services/audit.service");

// Naye imports Clean Architecture ke liye
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const createAccountController = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { currency = "INR" } = req.body; 

    try {
        const account = await prisma.account.create({
            data: {
                userId: userId,
                currency: currency, 
                balance: 0.00
            }
        });

        await logAction(userId, "WALLET_CREATED", { 
            accountId: account.id, 
            currency: account.currency 
        });

        return res.status(201).json(
            new ApiResponse(201, account, "Account created successfully")
        );
        
    } catch (error) {
        // Agar pehle se same currency ka account hai (Prisma unique constraint)
        if (error.code === 'P2002') {
            throw new ApiError(409, "Account with this currency already exists for this user", "ACCOUNT_ALREADY_EXISTS");
        }
        // Baki koi bhi error aaye, toh seedha Global Error Handler ke paas bhej do
        throw error; 
    }
});

const getUserAccountsController = asyncHandler(async (req, res) => {
    // Pura try-catch hat gaya hai
    const accounts = await prisma.account.findMany({
        where: { userId: req.user.id }
    });

    return res.status(200).json(
        new ApiResponse(200, { accounts }, "Accounts fetched successfully")
    );
});

const getAccountBalanceController = asyncHandler(async (req, res) => {
    const { accountId } = req.params;

    const account = await prisma.account.findFirst({
        where: {
            id: accountId,
            userId: req.user.id
        }
    });

    if (!account) {
        // Ab normal return ki jagah strictly ApiError throw hoga
        throw new ApiError(404, "Account not found or does not belong to you", "ACCOUNT_NOT_FOUND");
    }

    return res.status(200).json(
        new ApiResponse(200, { accountId: account.id, balance: account.balance }, "Balance fetched successfully")
    );
});

module.exports = {
    createAccountController,
    getUserAccountsController,
    getAccountBalanceController
};