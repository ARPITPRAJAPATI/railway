require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const { config } = require('./config');
const logger = require('./config/logger');
const { RedisClient } = require('./config/redis');

const routes = require('./routes');
const { corsMiddleware } = require('./middlewares/cors.middleware');
const errorHandler = require('./middlewares/error.middleware');
const { notFound } = require('./middlewares/notFound.middleware');
const { ipRateLimit } = require('./middlewares/rateLimiting.middleware');

// ─────────────────────────────────────────────────────────────────────────────
//  Express app setup
// ─────────────────────────────────────────────────────────────────────────────

const app = express();

app.set('trust proxy', 1); // Trust first proxy for accurate req.ip behind nginx/docker

// Security
app.use(helmet());
app.use(corsMiddleware);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global IP-level rate limit (coarse guard; endpoints can add stricter limits)
app.use(ipRateLimit());

// Routes — all mounted under /api
app.use('/api', routes);

// Root health check
app.get('/', (req, res) => {
    res.json({ service: 'api-gateway', status: 'ok' });
});

// 404 handler (must come after all routes)
app.use(notFound);

// Global error handler (must be last)
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────────────────────────────────────────

const startServer = async () => {
    try {
        // Warm up Redis connection
        const redisOk = await RedisClient.testConnection();
        if (!redisOk) {
            logger.warn('Redis connection test failed — rate limiting may not work');
        } else {
            logger.info('Redis connected');
        }

        const server = app.listen(config.PORT, () => {
            logger.info(
                `${config.SERVICE_NAME} running on http://localhost:${config.PORT} [${config.NODE_ENV}]`
            );
        });

        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`${signal} received — shutting down gracefully`);
            server.close(async () => {
                await RedisClient.closeConnection();
                logger.info('Server closed');
                process.exit(0);
            });

            // Force exit after 10 s if server doesn't close
            setTimeout(() => {
                logger.error('Forced shutdown after 10s timeout');
                process.exit(1);
            }, 10_000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (err) {
        logger.error('Failed to start API Gateway:', err);
        process.exit(1);
    }
};

startServer();