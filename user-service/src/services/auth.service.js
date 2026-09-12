const { ConflictError, BadRequestError, UnauthorizedError, ForbiddenError } = require("../utils/error");
const { generateAndStoreOtp, verifyOtp } = require("../utils/otp");
const { sendOTPEmail, verifyOTPEmail } = require("../utils/email");
const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");
const { config } = require("../config");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../utils/auth");
const { redis } = require("../config/redis");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");

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

const login = async (email, password, deviceId) => {
    const existingUser = await prisma.user.findUnique({
        where: { email }
    });
    if (!existingUser) {
        throw new BadRequestError("User not found");
    }
    const isPasswordValid = await bcrypt.compare(password, existingUser.password);
    if (!isPasswordValid) {
        throw new BadRequestError("Invalid password");
    }

    const accessToken = generateAccessToken(existingUser.id);
    const refreshToken = generateRefreshToken(existingUser.id);
    const { jti } = jwt.decode(refreshToken);

    await redis.set(`refresh:${existingUser.id}:${deviceId}`, jti, "EX", config.REFRESH_TOKEN_EXP_SEC);

    const { password: _password, ...safeUser } = existingUser;
    await redis.set(`user:${existingUser.id}`, JSON.stringify(safeUser), "EX", config.REDIS_USER_TTL);

    return { accessToken, refreshToken, loggedInUser: safeUser };
};

const rotateRefreshToken = async (refreshToken, deviceId) => {
    const payload = verifyRefreshToken(refreshToken);
    const { id: userId, jti } = payload;
    const storedJti = await redis.get(`refresh:${userId}:${deviceId}`);
    if (!storedJti) {
        throw new ForbiddenError("Refresh Token not valid", "login again");
    }
    if (storedJti !== jti) {
        await redis.del(`refresh:${userId}:${deviceId}`);
        throw new ForbiddenError("Refresh Token not valid");
    }
    const newAccessToken = generateAccessToken(userId);
    const newRefreshToken = generateRefreshToken(userId);
    const { jti: newJti } = jwt.decode(newRefreshToken);
    await redis.set(`refresh:${userId}:${deviceId}`, newJti, "EX", config.REFRESH_TOKEN_EXP_SEC);
    return { newAccessToken, newRefreshToken };
}

module.exports = {
    sendOTP,
    verifyOTP,
    login,
    rotateRefreshToken
};