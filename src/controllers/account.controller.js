const { prisma } = require("../config/db");
const { logAction } = require("../services/audit.service");

async function createAccountController(req, res) {
    try {
        const userId = req.user.id;
        
        // 1. THIS IS THE MISSING LINE: Read the currency from the Postman body
        const { currency = "INR" } = req.body; 

        // 2. Prisma creates the account using the variable we just defined
        const account = await prisma.account.create({
            data: {
                userId: userId,
                currency: currency, 
                balance: 0.00
            }
        });

        // 3. Log the successful wallet creation
        await logAction(userId, "WALLET_CREATED", { 
            accountId: account.id, 
            currency: account.currency 
        });

        return res.status(201).json({ account });
        
    } catch (error) {
        console.error("Create Account Error:", error);
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "Account with this currency already exists for this user" });
        }
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function getUserAccountsController(req, res) {
    try {
        const accounts = await prisma.account.findMany({
            where: { userId: req.user.id }
        });

        return res.status(200).json({ accounts });
    } catch (error) {
        console.error("Get Accounts Error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function getAccountBalanceController(req, res) {
    try {
        const { accountId } = req.params;

        const account = await prisma.account.findFirst({
            where: {
                id: accountId,
                userId: req.user.id
            }
        });

        if (!account) {
            return res.status(404).json({ message: "Account not found" });
        }

        return res.status(200).json({
            accountId: account.id,
            balance: account.balance
        });
    } catch (error) {
        console.error("Get Balance Error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = {
    createAccountController,
    getUserAccountsController,
    getAccountBalanceController
};