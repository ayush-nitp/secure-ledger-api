const swaggerJSDoc = require("swagger-jsdoc");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Secure Double-Entry Ledger API",
            version: "1.0.0",
            description: "API documentation for the Financial Ledger system",
        },
        servers: [
            {
                url: "http://localhost:3000",
                description: "Development Server",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    // Ye path batata hai ki API docs kahan dhundhni hain
    apis: ["./src/routes/*.js"], 
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;