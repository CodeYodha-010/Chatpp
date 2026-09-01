import logger from '../utils/logger.js';

export default function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      userId: req.user?.id,
      reqId: req.id
    });
  });
  next();
}
