const express = require('express');
const router = express.Router();

// Placeholder routes - implement auth endpoints here
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Auth route is active' });
});

module.exports = router;
