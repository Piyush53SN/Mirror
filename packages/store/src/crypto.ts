/**
 * Field encryption.
 *
 * Every event is stored twice: as plaintext metadata columns that the app must
 * query (time, kind, tier, session id) and as **one encrypted payload** holding
 * the part that matters — app names, queries, subjects, hashes, vectors. That is
 * a deliberate split:
 *
 *   - metadata is countable and carries no content, so it can be indexed;
 *   - anything a person would recognise lives only inside the ciphertext;
 *   - a stolen database leaks *that* the phone was used at 21:04, not *what* was
 *     looked at.
 *
 * Crypto choices:
 *   - **XChaCha20-Poly1305** (@noble/ciphers), a 24-byte random nonce per record
 *     and an AEAD tag. A nonce is random, not a counter: a counter needs durable
 *     state to survive a crash, and reusing a nonce is catastrophic.
 *   - Keys derive from one 32-byte root via **HKDF-SHA256** with distinct info
 *     strings, so the encryption key and the item-hash key are independent even
 *     though a person backs up one thing.
 *   - `item_hash` is HMAC-SHA256 under its own derived key: two events about the
 *     same item can be joined without storing what the item was.
 *
 * Envelope layout (versioned, so P6 sync can carry it unchanged):
 *   0x01 | keyIdLen(1) | keyId(utf8) | nonce(24) | ciphertext+tag
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js';
import type { RandomBytes } from './types';

export const ENVELOPE_VERSION = 1;
export const NONCE_BYTES = 24;

const INFO_ENCRYPTION = utf8ToBytes('mirror/store/encryption/v1');
const INFO_ITEM_HASH = utf8ToBytes('mirror/store/item-hash/v1');
const SALT = utf8ToBytes('mirror/store/root/v1');

export type DerivedKeys = { encryption: Uint8Array; itemHash: Uint8Array };

/** Derive the two subkeys. Deterministic, so a restore with the same root works. */
export function deriveKeys(rootKey: Uint8Array): DerivedKeys {
  if (rootKey.length !== 32) throw new Error(`root key must be 32 bytes, got ${rootKey.length}`);
  return {
    encryption: hkdf(sha256, rootKey, SALT, INFO_ENCRYPTION, 32),
    itemHash: hkdf(sha256, rootKey, SALT, INFO_ITEM_HASH, 32),
  };
}

/** Seal a JSON-serialisable value. Returns the envelope as bytes. */
export function seal(value: unknown, keys: DerivedKeys, keyId: string, random: RandomBytes): Uint8Array {
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const nonce = random(NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) throw new Error('nonce must be 24 bytes');
  const keyIdBytes = utf8ToBytes(keyId);
  if (keyIdBytes.length === 0 || keyIdBytes.length > 255) throw new Error('key id must be 1-255 bytes');
  const ciphertext = xchacha20poly1305(keys.encryption, nonce).encrypt(plaintext);

  const out = new Uint8Array(2 + keyIdBytes.length + NONCE_BYTES + ciphertext.length);
  out[0] = ENVELOPE_VERSION;
  out[1] = keyIdBytes.length;
  out.set(keyIdBytes, 2);
  out.set(nonce, 2 + keyIdBytes.length);
  out.set(ciphertext, 2 + keyIdBytes.length + NONCE_BYTES);
  return out;
}

/** Seal opaque bytes (a float32 vector) without a JSON round-trip. */
export function sealBytes(bytes: Uint8Array, keys: DerivedKeys, keyId: string, random: RandomBytes): Uint8Array {
  const nonce = random(NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) throw new Error('nonce must be 24 bytes');
  const keyIdBytes = utf8ToBytes(keyId);
  const ciphertext = xchacha20poly1305(keys.encryption, nonce).encrypt(bytes);
  const out = new Uint8Array(2 + keyIdBytes.length + NONCE_BYTES + ciphertext.length);
  out[0] = ENVELOPE_VERSION;
  out[1] = keyIdBytes.length;
  out.set(keyIdBytes, 2);
  out.set(nonce, 2 + keyIdBytes.length);
  out.set(ciphertext, 2 + keyIdBytes.length + NONCE_BYTES);
  return out;
}

export function openBytes(envelope: Uint8Array | ArrayBuffer, keys: DerivedKeys, expectedKeyId?: string): Uint8Array {
  const bytes = envelope instanceof Uint8Array ? envelope : new Uint8Array(envelope);
  if (bytes.length < 2 + NONCE_BYTES + 16) throw new DecryptionError('envelope is too short');
  if (bytes[0] !== ENVELOPE_VERSION) throw new DecryptionError(`unsupported envelope version ${bytes[0]}`);
  const keyIdLength = bytes[1]!;
  const nonceStart = 2 + keyIdLength;
  const keyId = new TextDecoder().decode(bytes.subarray(2, nonceStart));
  if (expectedKeyId !== undefined && keyId !== expectedKeyId) {
    throw new DecryptionError(`record was sealed with key "${keyId}", current key is "${expectedKeyId}"`);
  }
  try {
    return xchacha20poly1305(keys.encryption, bytes.subarray(nonceStart, nonceStart + NONCE_BYTES)).decrypt(
      bytes.subarray(nonceStart + NONCE_BYTES),
    );
  } catch {
    throw new DecryptionError('authentication failed: the record has been altered');
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/** Open an envelope. Throws DecryptionError on tampering, truncation or wrong key. */
export function open<T = unknown>(envelope: Uint8Array | ArrayBuffer, keys: DerivedKeys, expectedKeyId?: string): T {
  const bytes = envelope instanceof Uint8Array ? envelope : new Uint8Array(envelope);
  if (bytes.length < 2 + NONCE_BYTES + 16) throw new DecryptionError('envelope is too short');
  if (bytes[0] !== ENVELOPE_VERSION) throw new DecryptionError(`unsupported envelope version ${bytes[0]}`);

  const keyIdLength = bytes[1]!;
  const nonceStart = 2 + keyIdLength;
  if (bytes.length < nonceStart + NONCE_BYTES + 16) throw new DecryptionError('envelope is truncated');
  const keyId = new TextDecoder().decode(bytes.subarray(2, nonceStart));
  if (expectedKeyId !== undefined && keyId !== expectedKeyId) {
    throw new DecryptionError(`record was sealed with key "${keyId}", current key is "${expectedKeyId}"`);
  }

  const nonce = bytes.subarray(nonceStart, nonceStart + NONCE_BYTES);
  const ciphertext = bytes.subarray(nonceStart + NONCE_BYTES);
  let plaintext;
  try {
    plaintext = xchacha20poly1305(keys.encryption, nonce).decrypt(ciphertext);
  } catch {
    // The AEAD tag failed: the record was altered, or the key is wrong.
    throw new DecryptionError('authentication failed: the record has been altered');
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Read the key id from an envelope without decrypting it. */
export function envelopeKeyId(envelope: Uint8Array | ArrayBuffer): string {
  const bytes = envelope instanceof Uint8Array ? envelope : new Uint8Array(envelope);
  if (bytes.length < 3) throw new DecryptionError('envelope is too short');
  return new TextDecoder().decode(bytes.subarray(2, 2 + bytes[1]!));
}

/**
 * A stable, opaque identity for an item.
 *
 * The input is a canonical string (`sourceId:itemId`); the output is 64 hex
 * characters. Without the per-install key the hash cannot be reversed or matched
 * against a public corpus, which is the point: dedupe must not become a lookup
 * table of what a person read.
 */
export function itemHash(canonicalIdentity: string, keys: DerivedKeys): string {
  return bytesToHex(hmac(sha256, keys.itemHash, utf8ToBytes(canonicalIdentity)));
}

export const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
export const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'));
