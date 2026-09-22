const express = require('express');
const { createProxy } = require('../services/proxy');
const { requireAuth } = require('../middlewares/auth.middleware');
const { ipRateLimit, endpointRateLimit, combinedRateLimit } = require('../middlewares/rateLimiting.middleware');
const { config } = require('../config');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Service proxies
// ─────────────────────────────────────────────────────────────────────────────

const userServiceProxy = createProxy('userService', config.SERVICES.USER_SERVICE_URL);

// ─────────────────────────────────────────────────────────────────────────────
//  Gateway health
// ─────────────────────────────────────────────────────────────────────────────

router.get('/gateway/health', (req, res) => {
    res.status(200).json({
        success: true,
        service: 'api-gateway',
        status: 'healthy',
        timestamp: new Date().toISOString(),
    });
});

// ─────────────────────────────────────────────────────────────────────────────
//  User Service — Auth routes (PUBLIC)
//  Gateway path            → Downstream path
//  /api/users/auth/*       → /auth/*
// ─────────────────────────────────────────────────────────────────────────────

// Register (step 1 — send OTP)
router.post(
    '/users/auth/register',
    endpointRateLimit(5, 900000),   // 5 attempts / 15 min per IP
    userServiceProxy
);

// Verify OTP + complete registration
router.post(
    '/users/auth/verify-otp',
    endpointRateLimit(10, 900000),
    userServiceProxy
);

// Login
router.post(
    '/users/auth/login',
    endpointRateLimit(10, 900000),
    userServiceProxy
);

// Refresh access token
router.post(
    '/users/auth/refresh-token',
    endpointRateLimit(20, 900000),
    userServiceProxy
);

// Google OAuth
router.post(
    '/users/auth/google',
    endpointRateLimit(10, 900000),
    userServiceProxy
);

// Logout
router.post(
    '/users/auth/logout',
    requireAuth,
    userServiceProxy
);

// ─────────────────────────────────────────────────────────────────────────────
//  User Service — Protected user routes
//  Gateway path            → Downstream path
//  /api/users/user/*       → /user/*
// ─────────────────────────────────────────────────────────────────────────────

// Get current user profile
router.get(
    '/users/user/profile',
    requireAuth,
    combinedRateLimit,
    userServiceProxy
);

// Update profile (future)
router.put(
    '/users/user/profile',
    requireAuth,
    combinedRateLimit,
    userServiceProxy
);

module.exports = router;