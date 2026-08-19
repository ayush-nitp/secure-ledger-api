const { prisma } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { logAction } = require("../services/audit.service");

// Strict validation schemas
const registerSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(8, "Password must be at least 8 characters")
});

const loginSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string()
});

const register = async (req, res) => {
    try {
        // 1. Validate incoming data
        const validatedData = registerSchema.parse(req.body);

        // 2. Check for existing user
        const existingUser = await prisma.user.findUnique({
            where: { email: validatedData.email }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: { code: "EMAIL_IN_USE", message: "Email is already registered" }
            });
        }

        // 3. Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(validatedData.password, salt);

        // 4. Create user in PostgreSQL
        const newUser = await prisma.user.create({
            data: {
                name: validatedData.name,
                email: validatedData.email,
                passwordHash: passwordHash
            },
            select: { id: true, name: true, email: true, role: true, createdAt: true } // Exclude password from response
        });

        // 5. Log the registration event
        await logAction(newUser.id, "REGISTER", { email: newUser.email, message: "User registered successfully" });

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: newUser
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", details: error.errors } });
        }
        console.error("Registration Error:", error);
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Internal server error" } });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        // 1. Fetch the user
        const user = await prisma.user.findUnique({ where: { email } });

        // 2. Check if user exists AND if the passwordHash field is attached
        if (!user || !user.passwordHash) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // 3. Compare the typed password with the passwordHash from the database
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // 4. Create the short-lived Access Token (15 mins)
        const accessToken = jwt.sign(
            { id: user.id }, 
            process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod", 
            { expiresIn: "15m" }
        );

        // 5. Create the long-lived Refresh Token (7 days)
        const refreshToken = jwt.sign(
            { id: user.id },
            process.env.REFRESH_TOKEN_SECRET || "fallback_refresh_secret",
            { expiresIn: "7d" }
        );

        // 6. Send the Refresh Token in an HttpOnly Secure Cookie
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true, // Prevents JavaScript (XSS) from reading the cookie
            secure: process.env.NODE_ENV === "production", // Requires HTTPS in production
            sameSite: "strict", // Prevents Cross-Site Request Forgery (CSRF)
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
        });

        // 7. Log the successful login
        await logAction(user.id, "LOGIN", { email: user.email, message: "User logged in successfully" });

        // 8. Send ONLY the Access Token to the frontend JavaScript
        return res.status(200).json({ 
            success: true, 
            message: "Login successful", 
            token: accessToken // Frontend uses this in the Authorization header
        });
    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const logout = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(400).json({ success: false, message: "Token required for logout" });
        }

        const token = authHeader.split(" ")[1];
        
        // Decode the token just to read its expiration time (exp) and user ID (id)
        const decoded = jwt.decode(token);
        
        if (decoded && decoded.exp) {
            // Convert JWT timestamp (seconds) to JavaScript Date object (milliseconds)
            const expiresAt = new Date(decoded.exp * 1000);

            // Save the token to the PostgreSQL blacklist
            await prisma.tokenBlacklist.create({
                data: {
                    token,
                    expiresAt
                }
            });
        }

        res.clearCookie("refreshToken");

        // Log the logout event
        if (decoded && decoded.id) {
            await logAction(decoded.id, "LOGOUT", { message: "User logged out manually" });
        }

        return res.status(200).json({ success: true, message: "Logged out successfully" });
    } catch (error) {
        // If the token is already in the blacklist, Prisma will throw a unique constraint error (P2002)
        if (error.code === 'P2002') {
            return res.status(200).json({ success: true, message: "Already logged out" });
        }
        console.error("Logout Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const refreshToken = async (req, res) => {
    try {
        // 1. Read the Refresh Token from the HttpOnly cookie
        const token = req.cookies?.refreshToken;
        
        if (!token) {
            return res.status(401).json({ success: false, message: "No refresh token found" });
        }

        // 2. Verify the Refresh Token
        const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || "fallback_refresh_secret");

        // 3. Generate a brand new 15-minute Access Token
        const newAccessToken = jwt.sign(
            { id: decoded.id },
            process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod",
            { expiresIn: "15m" }
        );

        return res.status(200).json({
            success: true,
            token: newAccessToken
        });
    } catch (error) {
        // If the refresh token is expired or tampered with
        res.clearCookie("refreshToken"); // Clear the bad cookie
        return res.status(403).json({ success: false, message: "Invalid or expired refresh token. Please log in again." });
    }
};

module.exports = { register, login, logout, refreshToken };