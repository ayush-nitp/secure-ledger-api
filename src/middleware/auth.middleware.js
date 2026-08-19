const jwt = require("jsonwebtoken");
const { prisma } = require("../config/db");

async function authMiddleware(req, res, next) {
    try {
        const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Unauthorized access, token is missing" });
        }

        // Check if the token is blacklisted in PostgreSQL
        const isBlacklisted = await prisma.tokenBlacklist.findUnique({
            where: { token: token }
        });

        if (isBlacklisted) {
            return res.status(401).json({ message: "Unauthorized access, token has been revoked" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod");
        
        // Fetch user from PostgreSQL
        const user = await prisma.user.findUnique({ 
            where: { id: decoded.id } 
        });

        if (!user) {
            return res.status(401).json({ message: "Unauthorized access, user not found" });
        }

        req.user = user;
        return next();
    } catch (err) {
        return res.status(401).json({ message: "Unauthorized access, token is invalid" });
    }
}

async function authSystemUserMiddleware(req, res, next) {
    try {
        const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Unauthorized access, token is missing" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod");
        
        const user = await prisma.user.findUnique({ 
            where: { id: decoded.id } 
        });

        // Check if user exists and has the ADMIN role (replacing systemUser flag)
        if (!user || user.role !== 'ADMIN') {
            return res.status(403).json({ message: "Forbidden access, not a system user" });
        }

        req.user = user;
        return next();
    } catch (err) {
        console.error("Auth Middleware Crash:", err);
        return res.status(401).json({ message: "Unauthorized access, token is invalid" });
    }
}

module.exports = {
    authMiddleware,
    authSystemUserMiddleware
};