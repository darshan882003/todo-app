/**
 * Crypto utilities for PIN hashing using Web Crypto API
 * PBKDF2-HMAC-SHA-256 with 600,000 iterations (adjustable)
 */

const DEFAULT_ITERATIONS = 600000;
const MIN_ITERATIONS = 310000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return bufferToBase64(salt);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

function verifyIterations() {
  return new Promise(resolve => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const start = performance.now();
    crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('test'),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    ).then(key => {
      return crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: DEFAULT_ITERATIONS, hash: 'SHA-256' },
        key,
        HASH_LENGTH * 8
      );
    }).then(() => {
      const elapsed = performance.now() - start;
      if (elapsed > 1000) {
        resolve(MIN_ITERATIONS);
      } else {
        resolve(DEFAULT_ITERATIONS);
      }
    }).catch(() => resolve(DEFAULT_ITERATIONS));
  });
}

async function hashPin(pin, saltB64, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const salt = base64ToBuffer(saltB64);
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_LENGTH * 8
  );

  return bufferToBase64(hashBuffer);
}

async function createPinRecord(pin, length = 6) {
  if (!crypto.subtle) {
    throw new Error('Web Crypto API not available. This app requires a secure context (HTTPS or localhost).');
  }

  const salt = generateSalt();
  const iterations = await verifyIterations();
  const hash = await hashPin(pin, salt, iterations);

  return {
    v: 1,
    len: length,
    salt,
    iter: iterations,
    hash
  };
}

async function verifyPin(pin, record) {
  if (!record || !record.hash) return false;

  const hash = await hashPin(pin, record.salt, record.iter);
  const hashBuf = base64ToBuffer(hash);
  const storedBuf = base64ToBuffer(record.hash);

  return constantTimeEqual(new Uint8Array(hashBuf), new Uint8Array(storedBuf));
}

async function changePin(oldPin, newPin, record) {
  const valid = await verifyPin(oldPin, record);
  if (!valid) throw new Error('Current PIN is incorrect');

  return createPinRecord(newPin, record.len);
}

export {
  createPinRecord,
  verifyPin,
  changePin,
  hashPin,
  verifyIterations,
  DEFAULT_ITERATIONS,
  MIN_ITERATIONS
};