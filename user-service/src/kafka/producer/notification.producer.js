const { producer, connectProducer } = require('../../config/kafka');
const logger = require('../../config/logger');
const { TOPICS } = require('../../utils/constants');

class NotificationProducer {
    constructor() {
        this.isInitialized = false;
    }

    async initialize() {
        if (!this.isInitialized) {
            await connectProducer();
            this.isInitialized = true;
        }
    }

    async sendMessage(topic, key, value) {
        try {
            await this.initialize();

            const record = {
                topic,
                messages: [
                    {
                        key: key ? String(key) : `${topic}-${Date.now()}`,
                        value: JSON.stringify(value),
                        timestamp: Date.now().toString(),
                    },
                ],
            };

            const result = await producer.send(record);
            logger.info(`Message sent to Kafka topic [${topic}] with key [${record.messages[0].key}]`);
            return result;
        } catch (error) {
            logger.error(`Failed to send message to ${topic}:`, error);
            throw error;
        }
    }

    async sendOtpEmail(email, otp, ttlMinutes = 5) {
        return this.sendMessage(
            TOPICS.OTP_EMAIL,
            `otp-${email}`,
            {
                email,
                otp,
                ttlMinutes,
                type: 'OTP_VERIFICATION',
                createdAt: new Date().toISOString(),
            }
        );
    }

    // Alias to support sendOTPEmail as well
    async sendOTPEmail(email, otp, ttlMinutes = 5) {
        return this.sendOtpEmail(email, otp, ttlMinutes);
    }

    async sendWelcomeEmail(email, firstName) {
        return this.sendMessage(
            TOPICS.WELCOME_EMAIL,
            `welcome-${email}`,
            {
                email,
                firstName: firstName || 'User',
                type: 'WELCOME_EMAIL',
                createdAt: new Date().toISOString(),
            }
        );
    }
}

module.exports = new NotificationProducer();