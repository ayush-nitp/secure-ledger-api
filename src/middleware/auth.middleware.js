const jwt = require("jsonwebtoken");
const { prisma } = require("../config/db");

// Naye imports
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const authMiddleware = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
        throw new ApiError(401, "Unauthorized access, token is missing", "MISSING_TOKEN");
    }

    // Check if the token is blacklisted in PostgreSQL
    const isBlacklisted = await prisma.tokenBlacklist.findUnique({
        where: { token: token }
    });

    if (isBlacklisted) {
        throw new ApiError(401, "Unauthorized access, token has been revoked", "TOKEN_REVOKED");
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod");
        
        // Fetch user from PostgreSQL
        const user = await prisma.user.findUnique({ 
            where: { id: decoded.id } 
        });

        if (!user) {
            throw new ApiError(401, "Unauthorized access, user not found", "USER_NOT_FOUND");
        }

        if (user.tokenVersion !== decoded.tokenVersion) {
            throw new ApiError(401, "Session expired. You have been logged out from all devices.", "TOKEN_VERSION_MISMATCH");
        }

        req.user = user;
        next();
    } catch (err) {
        // Agar verify() me koi error aaye (jaise token expire ho jaye)
        if (err.name === "TokenExpiredError") {
            throw new ApiError(401, "Access token expired. Please login again.", "TOKEN_EXPIRED");
        }
        if (err instanceof ApiError) throw err; // User not found wala error yahan se pass hoga
        
        throw new ApiError(401, "Unauthorized access, token is invalid", "INVALID_TOKEN");
    }
});


const authSystemUserMiddleware = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
        throw new ApiError(401, "Unauthorized access, token is missing", "MISSING_TOKEN");
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod");
        
        const user = await prisma.user.findUnique({ 
            where: { id: decoded.id } 
        });

        // Check if user exists and has the ADMIN role (Phase 8: Authorization)
        if (!user || user.role !== 'ADMIN') {
            throw new ApiError(403, "Forbidden access, not a system user", "FORBIDDEN_ACCESS");
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            throw new ApiError(401, "Access token expired. Please login again.", "TOKEN_EXPIRED");
        }
        if (err instanceof ApiError) throw err; 
        
        throw new ApiError(401, "Unauthorized access, token is invalid", "INVALID_TOKEN");
    }
});

module.exports = {
    authMiddleware,
    authSystemUserMiddleware
};