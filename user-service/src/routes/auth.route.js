const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTP, login, rotateRefreshToken, verifyGoogleIdToken } = require("../controllers/auth.controllers");

router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.get("/refresh", rotateRefreshToken);
router.post("/google", verifyGoogleIdToken);

module.exports = router;