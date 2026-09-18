const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middlewares/auth.middleware');
const { getprofile } = require('../controllers/user.controller');

router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'User route is active' });
});

router.get('/profile', requireAuth, getprofile);

module.exports = router;
