// The encryption key is now server-only.
// Messages are decrypted server-side before being sent via socket.
// This file is kept for any future client-side crypto needs (e.g., end-to-end encryption).

export async function decryptMessage() {
  // Client-side decryption is no longer needed.
  // Server decrypts messages before sending them to clients.
  return '';
}