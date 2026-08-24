const { z } = require("zod");

const transactionSchema = z.object({
    fromAccount: z.string().uuid("Invalid sender account ID").optional(), // Optional for initial funds
    toAccount: z.string().uuid("Invalid receiver account ID"),
    amount: z.number().positive("Amount must be greater than zero").max(1000000, "Amount exceeds limits"),
    idempotencyKey: z.string().min(10, "Idempotency key required")
});

module.exports = { transactionSchema };