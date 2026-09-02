import bcrypt from 'bcrypt';
import env from '../config/env.js';

export async function hashPassword(password) {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
