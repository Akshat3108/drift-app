// 8.8 — Backup file format + AES-256-GCM encrypt/decrypt + PBKDF2 key
// derivation. Pure JS — no React Native imports, so the validation harness
// can exercise this file directly under Node.
//
// File format (49-byte header + payload):
//   [0..3]   'DFBK' magic (catches "user picked the wrong file")
//   [4]      version 0x01
//   [5..20]  PBKDF2 salt (16 random bytes)
//   [21..32] AES-GCM nonce (12 random bytes)
//   [33..]   ciphertext || GCM-tag (@noble's gcm output is concatenated:
//            the last 16 bytes are the authentication tag; flipping a byte
//            anywhere in this region produces an Invalid tag error on
//            decrypt, which we translate to BackupAuthError).
//
// PBKDF2: SHA-256, 100,000 iterations, 32-byte (256-bit) key. Industry
// standard ~2025 OWASP minimum. Sub-2s on mid-range Android.

import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/ciphers/utils.js';

export const MAGIC = new Uint8Array([0x44, 0x46, 0x42, 0x4B]);  // 'DFBK'
export const VERSION = 0x01;
export const SALT_LEN = 16;
export const NONCE_LEN = 12;
export const HEADER_LEN = 4 + 1 + SALT_LEN + NONCE_LEN;          // = 33
export const PBKDF2_ITERS = 100_000;
export const KEY_LEN = 32;

// Thrown when the GCM tag fails to verify — almost always wrong passphrase,
// occasionally a tampered backup. UI shows a "wrong passphrase" message.
export class BackupAuthError extends Error {
  constructor(message = 'wrong passphrase or tampered backup') {
    super(message);
    this.name = 'BackupAuthError';
  }
}

// Thrown for everything else: wrong magic, unsupported version, truncated
// input. UI shows the underlying message.
export class BackupFormatError extends Error {
  constructor(message) { super(message); this.name = 'BackupFormatError'; }
}

// ── Header pack/unpack ────────────────────────────────────────────────

// Pure — exported for the harness.
export function packHeader({ salt, nonce }) {
  if (salt.length !== SALT_LEN)   throw new Error(`salt must be ${SALT_LEN} bytes`);
  if (nonce.length !== NONCE_LEN) throw new Error(`nonce must be ${NONCE_LEN} bytes`);
  const out = new Uint8Array(HEADER_LEN);
  out.set(MAGIC, 0);
  out[4] = VERSION;
  out.set(salt, 5);
  out.set(nonce, 5 + SALT_LEN);
  return out;
}

export function parseHeader(bytes) {
  if (bytes.length < HEADER_LEN) {
    throw new BackupFormatError(`input truncated: need ${HEADER_LEN} header bytes, got ${bytes.length}`);
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new BackupFormatError('not a Drift backup (magic bytes mismatch)');
    }
  }
  const version = bytes[4];
  if (version !== VERSION) {
    throw new BackupFormatError(`unsupported backup version: 0x${version.toString(16)}`);
  }
  const salt  = bytes.slice(5, 5 + SALT_LEN);
  const nonce = bytes.slice(5 + SALT_LEN, HEADER_LEN);
  return { version, salt, nonce };
}

// ── Key derivation ────────────────────────────────────────────────────

async function deriveKey(passphrase, salt) {
  const pw = new TextEncoder().encode(String(passphrase ?? ''));
  return pbkdf2Async(sha256, pw, salt, { c: PBKDF2_ITERS, dkLen: KEY_LEN });
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────

export async function encryptZip(zipBytes, passphrase) {
  if (!(zipBytes instanceof Uint8Array)) throw new Error('zipBytes must be Uint8Array');
  const salt  = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const key   = await deriveKey(passphrase, salt);
  const ctTag = gcm(key, nonce).encrypt(zipBytes);  // returns ciphertext || tag
  const out = new Uint8Array(HEADER_LEN + ctTag.length);
  out.set(packHeader({ salt, nonce }), 0);
  out.set(ctTag, HEADER_LEN);
  return out;
}

export async function decryptZip(encryptedBytes, passphrase) {
  if (!(encryptedBytes instanceof Uint8Array)) throw new Error('encryptedBytes must be Uint8Array');
  const { salt, nonce } = parseHeader(encryptedBytes);
  if (encryptedBytes.length <= HEADER_LEN) {
    throw new BackupFormatError('input truncated: no ciphertext after header');
  }
  const ctTag = encryptedBytes.slice(HEADER_LEN);
  const key   = await deriveKey(passphrase, salt);
  try {
    return gcm(key, nonce).decrypt(ctTag);
  } catch (e) {
    // @noble throws a generic Error with message containing "tag" / "auth"
    // on a tag-verification failure. Translate to our typed error so the
    // UI can show the right message.
    throw new BackupAuthError();
  }
}
