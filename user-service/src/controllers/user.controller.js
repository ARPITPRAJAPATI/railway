const asyncHandler = require("../utils/asyncHandler");
const { BadRequestError } = require("../utils/error");
const userService = require("../services/user.service");

exports.getprofile = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new BadRequestError("invalid user id");
    }
    const user = await userService.getProfile(userId);
    return res.status(200).json({
        success: true,
        message: "User profile fetched successfully",
        data: user,
    });
});

exports.getProfile = exports.getprofile;