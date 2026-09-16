const { consumer } = require('../../config/kafka');
const emailService = require('../../services/email.service');
const logger = require('../../config/logger');
const { KAFKA_TOPICS } = require('../../constants/topics');

class EmailConsumer {
    async start() {
        try {
            await consumer.connect();
            logger.info('Email consumer connected to Kafka broker');

            const topics = [KAFKA_TOPICS.OTP_EMAIL, KAFKA_TOPICS.WELCOME_EMAIL];
            await consumer.subscribe({
                topics,
                fromBeginning: false,
            });

            logger.info(`Subscribed to Kafka topics: ${topics.join(', ')}`);

            await consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    const rawValue = message.value?.toString();
                    logger.info(`Received event from topic [${topic}] (partition ${partition})`);

                    let data;
                    try {
                        data = JSON.parse(rawValue);
                    } catch (parseErr) {
                        logger.error(`Failed to parse JSON message from topic ${topic}:`, parseErr.message);
                        return;
                    }

                    await this.handleMessage(topic, data);
                },
            });

            logger.info('Email consumer is actively listening for notification events...');
        } catch (error) {
            logger.error('Failed to start email consumer:', error.message);
            throw error;
        }
    }

    async handleMessage(topic, data) {
        try {
            switch (topic) {
                case KAFKA_TOPICS.OTP_EMAIL:
                    await this.handleOtpEmail(data);
                    break;

                case KAFKA_TOPICS.WELCOME_EMAIL:
                    await this.handleWelcomeEmail(data);
                    break;

                default:
                    logger.warn(`Unknown Kafka topic received: ${topic}`);
            }
        } catch (error) {
            logger.error(`Error processing message from topic ${topic}:`, error.message);
        }
    }

    async handleOtpEmail(data) {
        const { email, otp, ttlMinutes } = data;
        if (!email || !otp) {
            logger.warn('Skipping OTP email: missing email or otp payload', data);
            return;
        }
        await emailService.sendOtpEmail(email, otp, ttlMinutes || 5);
    }

    async handleWelcomeEmail(data) {
        const { email, firstName } = data;
        if (!email) {
            logger.warn('Skipping welcome email: missing email payload', data);
            return;
        }
        await emailService.sendWelcomeEmail(email, firstName || 'User');
    }

    async stop() {
        try {
            await consumer.disconnect();
            logger.info('Email consumer disconnected');
        } catch (err) {
            logger.error('Error stopping consumer:', err.message);
        }
    }
}

module.exports = new EmailConsumer();
