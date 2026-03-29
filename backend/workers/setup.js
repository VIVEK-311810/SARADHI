const logger = require('../logger');

/**
 * Mount the Bull Board job queue dashboard at /admin/queues.
 * Protected by BULL_BOARD_PASSWORD env var (HTTP basic auth).
 * Skips silently if Redis is unavailable (vectorizeQueue is null).
 *
 * @param {import('express').Application} app
 */
function setupBullBoard(app) {
  const { vectorizeQueue, aiSearchQueue } = require('../queues');
  if (!vectorizeQueue) return; // Redis not configured — skip

  const { createBullBoard } = require('@bull-board/api');
  const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter } = require('@bull-board/express');

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(vectorizeQueue),
      new BullMQAdapter(aiSearchQueue),
    ],
    serverAdapter,
  });

  // Basic-auth guard — require BULL_BOARD_PASSWORD env var
  const BOARD_PASSWORD = process.env.BULL_BOARD_PASSWORD;
  app.use('/admin/queues', (req, res, next) => {
    if (!BOARD_PASSWORD) return next(); // no password set → open (dev only)
    const auth = req.headers.authorization;
    if (auth) {
      const [, encoded] = auth.split(' ');
      const [, pwd] = Buffer.from(encoded, 'base64').toString().split(':');
      if (pwd === BOARD_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Bull Board"');
    res.status(401).send('Unauthorized');
  }, serverAdapter.getRouter());

  logger.info('Bull Board mounted at /admin/queues');
}

module.exports = { setupBullBoard };
