const express = require('express');
const { createProxy } = require('../services/proxy');
const { reqireAuth } = require('../middlewares/auth.middleware');
const { ipRateLimit, endpointRateLimit, combinedRateLimit } = require('../middlewares/rateLimiting.middleware');
const { config } = require('../config');


const router = express.Router();

const userServiceProxy = createProxy('userService', config.SERVICES.USER_SERVICE_URL);

router.post(
    '/users/auth/login',
    endpointRateLimit(10, 900000),
    userServiceProxy
);

router.get(
    '/users/user/profile',
    reqireAuth,
    combinedRateLimit,
    userServiceProxy
);

router.get('/gateway/health', (req, res) => {
    res.status(200).json({ message: 'API Gateway is healthy' });
});

module.exports = router;