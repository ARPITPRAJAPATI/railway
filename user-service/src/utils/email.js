const sgMail = require('@sendgrid/mail');
const logger = require('../config/logger');

if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.')) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const sendOTPEmail = async (email, otp) => {
    const msg = {
        to: email,
        from: process.env.MAIL_SEND,
        subject: 'IRCTC - Verification OTP',
        text: `Your OTP is: ${otp}. It is valid for 5 minutes.`,
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
                <p style="color: #666; font-size: 13px;">This OTP is valid for 5 minutes. Do not share this code with anyone.</p>
            </div>
        `,
    };

    try {
        await sgMail.send(msg);
        logger.info(`OTP email sent successfully to ${email}`);
    } catch (error) {
        logger.error('Failed to send OTP email via SendGrid', error?.response?.body || error.message);
        throw error;
    }
};

const verifyOTPEmail = async (recipient, name) => {
    const email = typeof recipient === 'object' ? recipient.email : recipient;
    const firstName = typeof recipient === 'object' ? recipient.firstName : name;

    const msg = {
        to: email,
        from: process.env.MAIL_SEND,
        subject: 'IRCTC - Email Verification Successful',
        text: `Hello ${firstName || ''}, your email has been successfully verified. Welcome to IRCTC!`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #0b3b60; text-align: center;">IRCTC Account Verification</h2>
                <p>Hello ${firstName || 'User'},</p>
                <p>Congratulations! Your email has been verified and your IRCTC account has been created successfully.</p>
                <p style="color: #666; font-size: 13px;">If you did not create this account, please contact IRCTC support immediately.</p>
            </div>
        `,
    };

    try {
        await sgMail.send(msg);
        logger.info(`Verification confirmation email sent successfully to ${email}`);
    } catch (error) {
        logger.error('Failed to send verification confirmation email via SendGrid', error?.response?.body || error.message);
        // Non-blocking: registration still succeeds even if email delivery fails
    }
};

module.exports = {
    sendOTPEmail,
    verifyOTPEmail,
};

