const express = require('express');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');

router.get('/', async (req, res) => {
  const checks = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    db: 'unknown',
    redis: 'not_configured',
  };

  try {
    await pool.query('SELECT 1');
    checks.db = 'healthy';
  } catch (err) {
    checks.db = 'unhealthy';
    logger.warn('Health check: DB unhealthy', { error: err.message });
  }

  const allHealthy = checks.db === 'healthy';
  if (!allHealthy) checks.status = 'degraded';

  res.status(allHealthy ? 200 : 503).json(checks);
});

module.exports = router;
