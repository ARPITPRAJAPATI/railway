const asyncHandler = require("../utils/asyncHandler");
const { BadRequestError } = require("../utils/error");
const authService = require("../services/auth.service");
const { config } = require("../config");



// 1. Ensure sendOTP is properly closed:
exports.sendOTP = asyncHandler(async (req, res, next) => {
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        throw new BadRequestError("All fields are required");
    }
    if (password !== confirmPassword) {
        throw new BadRequestError("password mismatch");
    }
    const { otpSessionId } = await authService.sendOTP(firstName, lastName, email, password);
    res.cookie("otp_session", otpSessionId, {
        httpOnly: true,
        secure: true,
        maxAge: config.OTP_TTL * 1000
    }).status(200).json({
        success: true,
        message: "OTP sent Successfully"
    });
});
exports.verifyOTP = asyncHandler(async (req, res, next) => {
    const otpSessionId = req.cookies?.otp_session || req.body?.otpSessionId;
    const { otp } = req.body;

    if (!otpSessionId || !otp) {
        throw new BadRequestError("OTP and session ID are required");
    }
    const user = await authService.verifyOTP(otp, otpSessionId);

    res.clearCookie("otp_session");

    return res.status(200).json({
        success: true,
        message: "User Registered Successfully",
        data: user
    });
});
