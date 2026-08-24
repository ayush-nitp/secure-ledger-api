require("dotenv").config();
const app = require("./src/app");
const { connectToDB, prisma } = require("./src/config/db"); // prisma import add kiya

// Database connect
connectToDB();

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});

// === GRACEFUL SHUTDOWN LOGIC ===
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Closing server gracefully...`);
    
    server.close(async () => {
        console.log('✅ HTTP server closed. No longer accepting new requests.');
        
        try {
            if (prisma) {
                await prisma.$disconnect();
                console.log('✅ Database connections closed.');
            }
            console.log('👋 Goodbye!');
            process.exit(0);
        } catch (err) {
            console.error('❌ Error during database disconnection:', err);
            process.exit(1);
        }
    });

    // Failsafe timer (10 seconds)
    setTimeout(() => {
        console.error('⚠️ Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));