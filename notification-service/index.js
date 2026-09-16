require('dotenv').config();
const emailConsumer = require('./kafka/consumer/email.consumer');
const logger = require('./config/logger');
const { config } = require('./config');

async function startNotificationService() {
    try {
        logger.info(`Starting ${config.SERVICE_NAME}...`);

        const requiredEnvVars = ['SENDGRID_API_KEY', 'MAIL_SEND', 'KAFKA_BROKER'];
        const missing = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missing.length > 0) {
            logger.warn(`Missing recommended environment variables: ${missing.join(', ')}`);
        }

        await emailConsumer.start();

        logger.info(`Notification Service is up and processing notifications`);
    } catch (error) {
        logger.error('Failed to start Notification Service:', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', { reason, promise });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
    process.exit(1);
});

startNotificationService();
