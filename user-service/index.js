require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { config } = require('./src/config/index.js');
const logger = require('./src/config/logger.js');

const authRoutes = require('./src/routes/auth.route.js');
const userRoutes = require('./src/routes/user.route.js');

const { corsMiddleware } = require('./src/middlewares/cors.middleware.js');
const errorHandler = require('./src/middlewares/error.middleware.js');
const { reqLogger } = require('./src/middlewares/req.middleware.js');
// const { disconnectProducer } = require('./config/kafka');

const app = express();

app.use(corsMiddleware);
app.use(helmet({
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
}));
app.use(reqLogger);
app.use(express.json());
app.use(cookieParser());
// app.use("/auth", authRoutes);
// app.use("/user", userRoutes);

app.get("/", (req, res) => {
    res.send("Hello from index.js of user-service");
})

app.get("/health", (req, res) => {
    res.status(200).json({
        message: "ok"
    })
})

app.use(errorHandler)

const startServer = async () => {
    try {
        const server = app.listen(config.PORT, () => {
            logger.info(
                `${config.SERVICE_NAME} is running on http://localhost:${config.PORT}`
            );
        })
        // Graceful shutdown
        //   const shutdown = async () => {
        //        logger.info('Shutting down gracefully...');

        //        server.close(async () => {
        //             await disconnectProducer();
        //             logger.info('Server closed');
        //             process.exit(0);
        //        });
        //   };

        //   process.on('SIGTERM', shutdown);
        //   process.on('SIGINT', shutdown);
    } catch (error) {
        logger.error("Failed to Start Server", error);
        process.exit(1);
    }
}
startServer();