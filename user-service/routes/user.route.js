const express = require('express');
const router = express.Router();

// Placeholder routes - implement user endpoints here
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'User route is active' });
});

module.exports = router;
