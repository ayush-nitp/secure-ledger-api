class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errorCode = "SERVER_ERROR", // Master prompt requirement
        errors = [],                // Inspiration: Zod validation errors ke liye
        stack = ""                  // Inspiration: Debugging ke liye
    ) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.message = message;
        this.errors = errors;
        this.data = null;           // Standard API response format
        this.success = false;       // Har error hamesha false hoga
        this.isOperational = true;  // Ye batane ke liye ki ye expected error hai

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

module.exports = ApiError;