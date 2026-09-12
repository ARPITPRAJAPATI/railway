const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTP, login } = require("../controllers/auth.controllers");

router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);

module.exports = router;