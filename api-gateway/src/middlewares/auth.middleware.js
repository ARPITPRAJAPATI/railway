const { verifyAccessToken } = require('../utils/auth');
const { UnauthorizedError } = require('../utils/error');
const asyncHandler = require('../utils/asyncHandler');

const requireAuth = asyncHandler(async (req, res, next) => {
    const accessToken = req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];

    if (!accessToken) {
        throw new UnauthorizedError("unauthorized access");
    }

    try {
        const payload = verifyAccessToken(accessToken);
        req.user = {
            id: payload.id || payload.userId
        };
        next();
    } catch (error) {
        throw new UnauthorizedError("Invalid or expired Access Token");
    }
});

module.exports = {
    requireAuth
};
