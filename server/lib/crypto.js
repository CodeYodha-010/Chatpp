import crypto from 'crypto';
import fs from 'fs';

import path from 'path';
const envPath = path.join(process.cwd(), '.env');
const keyName = 'CHAT_ENCRYPTION_KEY';

// On first run, generate and save key
if (!process.env[keyName]) {
  const newKey = crypto.randomBytes(32).toString('hex');
  process.env[keyName] = newKey;

  // Append to .env if file exists
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (!envContent.includes(keyName)) {
      fs.appendFileSync(envPath, `\n${keyName}=${newKey}\n`);
      console.log('Generated new CHAT_ENCRYPTION_KEY and saved to .env');
    }
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
