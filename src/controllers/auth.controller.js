const { prisma } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { logAction } = require("../services/audit.service");
const { registerSchema, loginSchema } = require("../validators/auth.validator");

// Naye imports Clean Architecture ke liye
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const register = asyncHandler(async (req, res) => {
    // 1. Validate incoming data (Error will be handled by global error handler)
    const validatedData = registerSchema.parse(req.body);

    // 2. Check for existing user
    const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email }
    });

    if (existingUser) {
        throw new ApiError(409, "Email is already registered", "EMAIL_IN_USE");
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
        select: { id: true, name: true, email: true, role: true, createdAt: true }
    });

    // 5. Log the registration event
    await logAction(newUser.id, "REGISTER", { email: newUser.email, message: "User registered successfully" });

    // 6. Return standard ApiResponse
    return res.status(201).json(
        new ApiResponse(201, newUser, "User registered successfully")
    );
});

const login = asyncHandler(async (req, res) => {
    // 1. Zod Validation (Ye purane code me missing tha, ab add kar diya hai!)
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    // 2. Fetch the user
    const user = await prisma.user.findUnique({ where: { email } });

    // 3. Check if user exists AND if the passwordHash field is attached
    if (!user || !user.passwordHash) {
        throw new ApiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }

    // 4. Compare the typed password with the passwordHash from the database
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        throw new ApiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }

    console.log("DB se aaya hua user object:", user);

    // 5. Create tokens
    const accessToken = jwt.sign(
        { 
            id: user.id,
            tokenVersion: user.tokenVersion // Ye naya field add kiya 
        }, 
        process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod", 
        { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
        { id: user.id },
        process.env.REFRESH_TOKEN_SECRET || "fallback_refresh_secret",
        { expiresIn: "7d" }
    );

    // 6. Send the Refresh Token in an HttpOnly Secure Cookie
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // 7. Log the successful login
    await logAction(user.id, "LOGIN", { email: user.email, message: "User logged in successfully" });

    // 8. Send standard ApiResponse
    return res.status(200).json(
        new ApiResponse(200, { token: accessToken }, "Login successful")
    );
});

const logout = asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new ApiError(401, "Token required for logout", "TOKEN_REQUIRED");
    }

    const token = authHeader.split(" ")[1];
    
    // Decode the token just to read its expiration time (exp) and user ID (id)
    const decoded = jwt.decode(token);
    
    if (decoded && decoded.exp) {
        const expiresAt = new Date(decoded.exp * 1000);

        try {
            // Save the token to the PostgreSQL blacklist
            await prisma.tokenBlacklist.create({
                data: { token, expiresAt }
            });
        } catch (error) {
            // If already in blacklist, Prisma throws P2002. We handle it silently here.
            if (error.code === 'P2002') {
                res.clearCookie("refreshToken");
                return res.status(200).json(new ApiResponse(200, null, "Already logged out"));
            }
            throw error; // Other DB errors will go to the global error handler
        }
    }

    res.clearCookie("refreshToken");

    // Log the logout event
    if (decoded && decoded.id) {
        await logAction(decoded.id, "LOGOUT", { message: "User logged out manually" });
    }

    return res.status(200).json(
        new ApiResponse(200, null, "Logged out successfully")
    );
});

const refreshToken = asyncHandler(async (req, res) => {
    // 1. Read the Refresh Token from the HttpOnly cookie
    const token = req.cookies?.refreshToken;
    
    if (!token) {
        throw new ApiError(401, "No refresh token found", "NO_REFRESH_TOKEN");
    }

    try {
        // 2. Verify the Refresh Token
        const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || "fallback_refresh_secret");

        // 3. Generate a brand new 15-minute Access Token
        const newAccessToken = jwt.sign(
            { id: decoded.id },
            process.env.JWT_SECRET || "fallback_secret_do_not_use_in_prod",
            { expiresIn: "15m" }
        );

        return res.status(200).json(
            new ApiResponse(200, { token: newAccessToken }, "Token refreshed successfully")
        );
    } catch (error) {
        // Local try-catch here because if verification fails, we MUST clear the cookie before throwing the ApiError
        res.clearCookie("refreshToken"); 
        throw new ApiError(403, "Invalid or expired refresh token. Please log in again.", "INVALID_REFRESH_TOKEN");
    }
});

const logoutAll = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // User ka tokenVersion ek se badha dein
    await prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } }
    });

    return res.status(200).json(
        new ApiResponse(200, null, "Successfully logged out from all devices. All previous tokens are now invalid.")
    );
});

module.exports = { register, login, logout, refreshToken, logoutAll };