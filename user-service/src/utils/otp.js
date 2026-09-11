const crypto = require("crypto");
const { config } = require("../config");
const { redis } = require("../config/redis");
const { TooManyRequestsError, BadRequestError } = require("./error");
const otpGenerator = require("otp-generator");

const RATE_MAX = parseInt(config.OTP_RATE_MAX_PER_HOUR || "5", 10);
const OTP_TTL = parseInt(config.OTP_TTL || "300", 10);
const ATTEMPT_MAX = parseInt(config.OTP_MAX_VERIFY_ATTEMPTS || "5", 10);
const OTP_HMAC_SECRET = config.OTP_HMAC_SECRET;

function hmacFor(email, otp) {
    return crypto.createHmac('sha256', OTP_HMAC_SECRET).update(email + ":" + otp).digest('hex');
}

async function generateAndStoreOtp(meta) {
    const rateKey = `otp:rate:${meta.email}`;
    const sentCount = parseInt(await redis.get(rateKey) || '0', 10);
    if (sentCount >= RATE_MAX) {
        throw new TooManyRequestsError(
            "Too many OTP requests. Try again later."
        );
    }

    const otp = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false
    });

    const otpSessionId = crypto.randomUUID();
    const hashed = hmacFor(meta.email, otp);

    await redis.set(`otp:session:${otpSessionId}`, JSON.stringify({
        hashedOtp: hashed,
        meta
    }), 'EX', OTP_TTL);

    await redis.incr(rateKey);
    await redis.expire(rateKey, 3600);

    return { otp, otpSessionId };
}

async function verifyOtp(otp, otpSessionId) {
    const rawData = await redis.get(`otp:session:${otpSessionId}`);
    if (!rawData) {
        throw new BadRequestError("Invalid or expired OTP session");
    }

    const { hashedOtp: storeOtp, meta } = JSON.parse(rawData);
    if (!meta || !meta.email) {
        throw new BadRequestError("Invalid OTP session data");
    }

    const attemptsKey = `otp:attempts:${meta.email}`;
    const attemptsCount = parseInt(await redis.get(attemptsKey) || '0', 10);
    if (attemptsCount >= ATTEMPT_MAX) {
        throw new TooManyRequestsError(
            "Too many attempts. Please try again later."
        );
    }

    const hashedOtp = hmacFor(meta.email, otp);
    const storeBuffer = Buffer.from(storeOtp);
    const hashBuffer = Buffer.from(hashedOtp);

    const isMatch = storeBuffer.length === hashBuffer.length && crypto.timingSafeEqual(storeBuffer, hashBuffer);

    if (isMatch) {
        await redis.del(`otp:session:${otpSessionId}`);
        await redis.del(attemptsKey);
        await redis.del(`otp:rate:${meta.email}`);
        return meta;
    } else {
        await redis.incr(attemptsKey);
        await redis.expire(attemptsKey, OTP_TTL);
        return null;
    }
}

module.exports = { generateAndStoreOtp, verifyOtp };