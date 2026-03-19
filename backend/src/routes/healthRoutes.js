const express = require('express');

const { getDatabaseStatus } = require('../lib/database');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'rentz-arena-backend',
    database: getDatabaseStatus()
  });
});

module.exports = router;
