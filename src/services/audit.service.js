const { prisma } = require("../config/db");

/**
 * Creates an append-only audit log entry.
 * We wrap this in a try/catch but DO NOT throw the error. 
 * If logging fails, it shouldn't crash the user's login or transfer.
 */
const logAction = async (userId, action, details = {}) => {
    try {
        let currentEntityType = "SYSTEM";
        let currentEntityId = userId; 
        
        // Dynamically figure out the Type and the exact ID
        if (action === "LOGIN" || action === "LOGOUT" || action === "REGISTER") {
            currentEntityType = "USER";
            currentEntityId = userId;
        } else if (action === "WALLET_CREATED") {
            currentEntityType = "WALLET";
            currentEntityId = details.accountId || userId; 
        } else if (action === "FUNDS_TRANSFERRED") {
            currentEntityType = "TRANSACTION";
            currentEntityId = details.transactionId || userId;
        }

        // Pass everything to Prisma
        await prisma.auditLog.create({
            data: {
                userId: userId,
                action: action,          
                metadata: details,        // <--- THE FIX: Changed 'details' to 'metadata'
                entityType: currentEntityType,
                entityId: currentEntityId 
            }
        });
    } catch (error) {
        console.error(`[AUDIT LOG FAILED] Action: ${action} | Error:`, error.message);
    }
};

module.exports = { logAction };