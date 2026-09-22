const { redis } = require('../config/redis');
const { TooManyRequestsError } = require('../utils/error');
const logger = require('../config/logger');
const { config } = require('../config');

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter using Redis INCR + TTL.
 * Returns true if the request is ALLOWED, throws TooManyRequestsError otherwise.
 */
async function checkRateLimit(key, maxRequests, windowMs) {
    try {
        const current = await redis.incr(key);

        if (current === 1) {
            // First hit — set expiry equal to the window
            await redis.pexpire(key, windowMs);
        }

        if (current > maxRequests) {
            const ttl = await redis.pttl(key);
            const retryAfterSec = Math.ceil(ttl / 1000);

            logger.warn(`Rate limit exceeded for key: ${key} (${current}/${maxRequests})`);
            throw new TooManyRequestsError(
                `Too many requests. Please retry after ${retryAfterSec} seconds.`
            );
        }

        return true;
    } catch (err) {
        if (err instanceof TooManyRequestsError) throw err;
        // If Redis is down, fail open (don't block legitimate traffic)
        logger.error('Rate limiter Redis error (failing open):', err.message);
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Middleware factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ipRateLimit — limits requests per IP address.
 * Usage: router.use(ipRateLimit())
 *
 * @param {number} max        Max requests per window (default from config)
 * @param {number} windowMs   Window duration in ms  (default from config)
 */
function ipRateLimit(
    max = config.RATE_LIMIT_MAX_REQUESTS,
    windowMs = config.RATE_LIMIT_WINDOW_MS
) {
    return async (req, res, next) => {
        try {
            const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
            const key = `ratelimit:ip:${ip}`;
            await checkRateLimit(key, max, windowMs);
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * endpointRateLimit — limits requests per IP per specific route.
 * Usage: router.post('/auth/login', endpointRateLimit(10, 900000), proxy)
 *
 * @param {number} max       Max requests per window
 * @param {number} windowMs  Window duration in ms
 */
function endpointRateLimit(max, windowMs) {
    return async (req, res, next) => {
        try {
            const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
            const route = req.path.replace(/\//g, ':');          // /auth/login → :auth:login
            const key = `ratelimit:endpoint:${ip}:${route}`;
            await checkRateLimit(key, max, windowMs);
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * combinedRateLimit — limits requests per authenticated user ID (from x-user-id header).
 * Falls back to IP if header is missing.
 * Usage: router.get('/user/profile', requireAuth, combinedRateLimit, proxy)
 */
async function combinedRateLimit(req, res, next) {
    try {
        const userId = req.headers['x-user-id'];
        const identifier = userId
            ? `user:${userId}`
            : `ip:${req.ip || 'unknown'}`;

        const key = `ratelimit:combined:${identifier}`;
        await checkRateLimit(key, config.RATE_LIMIT_MAX_REQUESTS, config.RATE_LIMIT_WINDOW_MS);
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { ipRateLimit, endpointRateLimit, combinedRateLimit };
