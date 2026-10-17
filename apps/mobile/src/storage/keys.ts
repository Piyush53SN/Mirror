/**
 * The root key.
 *
 * One 32-byte key per install, created on first launch with `expo-crypto` and
 * kept in the platform keystore through `expo-secure-store`. It is never written
 * to the database, never logged and never leaves the device. Deleting the app
 * deletes the key, which makes every ciphertext written by the app unreadable —
 * including any copy of the database that was extracted from the phone.
 *
 * Limitation, stated rather than hidden: `expo-secure-store` protects the key with
 * the Android Keystore / iOS Keychain. A rooted device or a compromised OS can
 * still read it while the app is installed. That is the threat model; see
 * docs/P1B.md.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { KeyProvider } from '@mirror/store';

const KEY_NAME = 'mirror.root-key.v1';
const KEY_ID_NAME = 'mirror.root-key-id.v1';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export function secureStoreKeys(): KeyProvider {
  return {
    async keyId() {
      const existing = await SecureStore.getItemAsync(KEY_ID_NAME);
      if (existing) return existing;
      const id = `k${Date.now().toString(36)}`;
      await SecureStore.setItemAsync(KEY_ID_NAME, id, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      return id;
    },
    async rootKey() {
      const existing = await SecureStore.getItemAsync(KEY_NAME);
      if (existing) return fromBase64(existing);
      const created = Crypto.getRandomBytes(32);
      await SecureStore.setItemAsync(KEY_NAME, toBase64(created), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      return created;
    },
  };
}

/** Injected into the store: nonces come from the OS RNG, never Math.random. */
export const osRandom = (length: number): Uint8Array => Crypto.getRandomBytes(length);
