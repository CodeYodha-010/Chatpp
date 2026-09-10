import logger from '../utils/logger.js';

// Adds X-Response-Time header for performance monitoring
export function responseTime(req, res, next) {
  const start = Date.now();
  const originalEnd = res.end.bind(res);
  res.end = (...args) => {
    try {
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
      }
    } catch { /* never break the response over a debug header */ }
    return originalEnd(...args);
  };
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
