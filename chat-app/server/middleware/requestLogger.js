import logger from '../utils/logger.js';

// Adds X-Response-Time header for performance monitoring
export function responseTime(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
  });
  next();
}

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
