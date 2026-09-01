import crypto from 'crypto';
import env from '../config/env.js';

export function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const header = req.headers['x-csrf-token'];
  const body = req.body?.csrf_token;

  const cookie = req.cookies?._csrf;
  if (!cookie) {
    return res.status(403).json({ error: 'CSRF: missing cookie' });
  }

  const provided = header || body;
  if (!provided) {
    return res.status(403).json({ error: 'CSRF: missing token' });
  }

  const compared = provided.length === cookie.length
    ? crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(cookie))
    : false;

  if (!compared) {
    return res.status(403).json({ error: 'CSRF: token mismatch' });
  }

  next();
}

export function issueCsrfToken(req, res, next) {
  if (req.cookies?._csrf) return next();

  const token = crypto.randomBytes(32).toString('hex');
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 1000,
  };
  res.cookie('_csrf', token, cookieOpts);
  next();
}

export function getCsrfToken(req, res, next) {
  res.json({ csrfToken: req.cookies?._csrf || crypto.randomBytes(32).toString('hex') });
}
