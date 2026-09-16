const sgMail = require('@sendgrid/mail');
const logger = require('../config/logger');
const { config } = require('../config');

if (config.SENDGRID_API_KEY && config.SENDGRID_API_KEY.startsWith('SG.')) {
    sgMail.setApiKey(config.SENDGRID_API_KEY);
}

class EmailService {
    constructor() {
        this.from = config.MAIL_SEND || 'no-reply@railway.com';
    }

    async sendEmail(msg) {
        try {
            await sgMail.send(msg);
            logger.info(`Email successfully delivered to ${msg.to} (Subject: "${msg.subject}")`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to send email to ${msg.to}:`, error?.response?.body || error.message);
            throw error;
        }
    }

    async sendOtpEmail(email, otp, ttlMinutes = 5) {
        const msg = {
            to: email,
            from: this.from,
            subject: 'IRCTC - Verification OTP',
            text: `Your OTP is: ${otp}. It is valid for ${ttlMinutes} minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #0b3b60; text-align: center;">IRCTC Account Verification</h2>
                    <p>Hello,</p>
                    <p>Your One-Time Password (OTP) for registration/verification is:</p>
                    <div style="text-align: center; margin: 24px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #d32f2f; background: #fbe9e7; padding: 10px 20px; border-radius: 6px; display: inline-block;">
                            ${otp}
                        </span>
                    </div>
                    <p style="color: #666; font-size: 13px;">This OTP is valid for ${ttlMinutes} minutes. Do not share this code with anyone.</p>
                </div>
            `,
        };

        return this.sendEmail(msg);
    }

    async sendWelcomeEmail(email, firstName) {
        const msg = {
            to: email,
            from: this.from,
            subject: 'IRCTC - Email Verification Successful',
            text: `Hello ${firstName || 'User'}, your email has been successfully verified. Welcome to IRCTC!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #0b3b60; text-align: center;">IRCTC Welcome</h2>
                    <p>Hello ${firstName || 'User'},</p>
                    <p>Congratulations! Your email has been verified and your IRCTC account has been created successfully.</p>
                    <p style="color: #666; font-size: 13px;">If you did not create this account, please contact IRCTC support immediately.</p>
                </div>
            `,
        };

        return this.sendEmail(msg);
    }
}

module.exports = new EmailService();
