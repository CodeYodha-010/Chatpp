let ENCRYPTION_KEY = null;

async function getKey() {
  if (ENCRYPTION_KEY) return ENCRYPTION_KEY;
  const r = await fetch('/api/get_key');
  const data = await r.json();
  ENCRYPTION_KEY = data.key;
  return ENCRYPTION_KEY;
}

function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substr(i, 2), 16);
  return b;
}

export async function decryptMessage(encrypted, iv, authTag) {
  try {
    const keyHex = await getKey();
    const keyBytes = hexToBytes(keyHex);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const ivBytes = hexToBytes(iv);
    const ct = hexToBytes(encrypted);
    const atBytes = hexToBytes(authTag);
    const combined = new Uint8Array(ct.length + atBytes.length);
    combined.set(ct);
    combined.set(atBytes, ct.length);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, combined);
    return new TextDecoder().decode(dec);
  } catch (e) {
    console.error('Decrypt failed:', e);
    return '🔒 Encrypted';
  }
}
