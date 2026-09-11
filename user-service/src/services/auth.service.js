const { ConflictError, BadRequestError } = require("../utils/error");
const { generateAndStoreOtp, verifyOtp } = require("../utils/otp");
const { sendOTPEmail, verifyOTPEmail } = require("../utils/email");
const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");
const { config } = require("../config");

const sendOTP = async (firstName, lastName, email, password) => {
    const existingUser = await prisma.user.findUnique({
        where: { email }
    });
    if (existingUser) {
        throw new ConflictError("User already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const meta = { firstName, lastName, email, hashedPassword };
    const { otp, otpSessionId } = await generateAndStoreOtp(meta);
    await sendOTPEmail(email, otp);
    return { otpSessionId };
};

const verifyOTP = async (otp, otpSessionId) => {
    const meta = await verifyOtp(otp, otpSessionId);
    if (!meta) {
        throw new BadRequestError("Invalid OTP");
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: meta.email }
    });
    if (existingUser) {
        throw new ConflictError("User already registered");
    }

    const user = await prisma.user.create({
        data: {
            firstName: meta.firstName,
            lastName: meta.lastName,
            email: meta.email,
            password: meta.hashedPassword,
            emailVerified: true
        }
    });

    await verifyOTPEmail(meta);

    const { password: _, ...safeUser } = user;
    return safeUser;
};

module.exports = {
    sendOTP,
    verifyOTP
};