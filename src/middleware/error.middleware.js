const ApiError = require("../utils/ApiError");

const errorHandler = (err, req, res, next) => {
    let error = err;

    // 1. Agar error Zod validation ka hai (Name se check karna sabse safe hai)
    if (error.name === "ZodError") {
        // Zod naye versions me .issues use karta hai, purane me .errors
        const validationErrors = error.issues || error.errors || [];
        
        const extractedErrors = validationErrors.map(e => ({
            field: e.path.join('.'),
            message: e.message
        }));
        
        error = new ApiError(400, "Validation Failed", "VALIDATION_ERROR", extractedErrors);
    }

    // 2. Agar koi anjaan error aa jaye (jo ApiError ka part nahi hai)
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || "Internal Server Error";
        error = new ApiError(statusCode, message, "SERVER_ERROR", [], err.stack);
    }

    // 3. Final JSON Response
    return res.status(error.statusCode).json({
        success: false,
        errorCode: error.errorCode,
        message: error.message,
        errors: error.errors || [], // Yahan extracted errors send honge
        // Stack trace sirf development mode me dikhega
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
};

module.exports = errorHandler;