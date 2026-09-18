const logger = require("../config/logger");
const { redis } = require("../config/redis");
const { NotFoundError } = require("../utils/error");
const prisma = require("../config/prisma");
const { config } = require("../config");

const getProfile = async (userId) => {
    logger.info(`Checking user in Redis for id: ${userId}`);
    const storedUser = await redis.get(`user:${userId}`);

    if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        logger.info(`Serving user from Redis cache: ${parsedUser.email}`);
        return parsedUser;
    }

    logger.info("User not in Redis, fetching user from DB");
    const userProfile = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!userProfile) {
        throw new NotFoundError("User not found");
    }

    // Cache the user profile in Redis
    await redis.setex(
        `user:${userId}`,
        config.REDIS_USER_TTL,
        JSON.stringify(userProfile)
    );
    logger.info(`Cached user profile in Redis for: ${userProfile.email}`);

    return userProfile;
};

module.exports = {
    getProfile,
};