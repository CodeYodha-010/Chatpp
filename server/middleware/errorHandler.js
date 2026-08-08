import logger from '../utils/logger.js';
import env from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, req, res, next) {
  logger.error('Error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT' || err.message?.includes('UNIQUE constraint')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  res.status(err.status || 500).json({
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
}
