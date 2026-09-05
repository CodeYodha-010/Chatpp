import crypto from 'crypto';

const keyName = 'CHAT_ENCRYPTION_KEY';

// Validate encryption key — required for consistent decryption across restarts in production
if (!process.env[keyName]) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: CHAT_ENCRYPTION_KEY is not set in production.');
    console.error('Set a 64-character hex key. Generate one with:');
    console.error('node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  console.warn('CHAT_ENCRYPTION_KEY not set in .env. Using generated key (data will not persist across restarts).');
}

const ENCRYPTION_KEY = process.env[keyName];

function encryptMessage(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decryptMessage({ encrypted, iv, authTag }) {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '[DECRYPTION FAILED]';
  }
}

export { encryptMessage, decryptMessage };
