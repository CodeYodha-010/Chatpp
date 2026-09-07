import logger from '../utils/logger.js';
import env from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, req, res, next) {
  const isProd = env.NODE_ENV === 'production';
  const status = err.status || 500;

  logger.error('Error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: !isProd ? err.stack : undefined,
    reqId: req.id
  });

  // Known Prisma/SQLite unique constraint violations
  if (err.code === 'P2002' || err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT' || err.message?.includes('UNIQUE constraint')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  // Prisma validation errors
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // JSON parse errors from malformed request bodies
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  res.status(status).json({
    error: isProd ? (status === 500 ? 'Internal server error' : err.message) : err.message,
    ...(isProd ? {} : { stack: err.stack })
  });
}