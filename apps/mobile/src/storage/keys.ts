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
 *
 * Fix for key stability across updates (2026-10-20):
 * - Old code stored key and id in two separate SecureStore entries (v1), not atomically.
 *   Crash between writes could leave one without the other, and id was time-based (Date.now()),
 *   so a cleared SecureStore produced new id -> old DB unreadable with "sealed with key X, current Y".
 * - New code uses single atomic entry v2: JSON {k: base64RootKey, id: keyId} stored as mirror.root-key.v2.
 *   Id is derived from key (first 6 bytes -> base36) so it never diverges.
 * - Migration: if v1 pair exists, migrate to v2 preserving old id (keeps existing DB readable).
 *   If only key exists, derive id from key. If only id exists (backup restore case where DB restored but keystore not),
 *   create new key+id and let UI detect mismatch and prompt reset.
 * - Backup: with android:allowBackup=false, DB and SecureStore are excluded from Android auto-backup,
 *   so restore cannot bring old DB without key. See PROGRESS.md for backup interaction.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { KeyProvider } from '@mirror/store';

const LEGACY_KEY_NAME = 'mirror.root-key.v1';
const LEGACY_ID_NAME = 'mirror.root-key-id.v1';
const KEY_V2_NAME = 'mirror.root-key.v2';

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

/**
 * Stable id derived from the root key – deterministic, so the id never
 * diverges from the key. Uses first 6 bytes as base36 (8 chars) prefixed with k.
 * Example: kmvezvsza-style but derived from key, not Date.now().
 * Keeps format compatible with existing envelope check (1-255 bytes).
 */
function idFromKey(key: Uint8Array): string {
  let num = 0;
  for (let i = 0; i < 6; i += 1) {
    num = num * 256 + (key[i] ?? 0);
  }
  return `k${num.toString(36).padStart(8, '0').slice(-8)}`;
}

type Cached = { keyB64: string; id: string };

export function secureStoreKeys(): KeyProvider {
  let cached: Cached | null = null;
  let pending: Promise<Cached> | null = null;

  async function ensure(): Promise<Cached> {
    if (cached) return cached;
    if (pending) return pending;
    pending = (async () => {
      // 1. Try v2 (atomic)
      const v2raw = await SecureStore.getItemAsync(KEY_V2_NAME);
      if (v2raw) {
        try {
          const parsed = JSON.parse(v2raw) as { k?: string; id?: string };
          if (parsed.k && parsed.id) {
            cached = { keyB64: parsed.k, id: parsed.id };
            return cached;
          }
        } catch {
          // corrupt v2, fall through
        }
      }

      // 2. Try legacy v1 pair – migrate if both exist
      const legacyKey = await SecureStore.getItemAsync(LEGACY_KEY_NAME);
      const legacyId = await SecureStore.getItemAsync(LEGACY_ID_NAME);

      if (legacyKey && legacyId) {
        const toStore = JSON.stringify({ k: legacyKey, id: legacyId });
        await SecureStore.setItemAsync(KEY_V2_NAME, toStore, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        cached = { keyB64: legacyKey, id: legacyId };
        return cached;
      }

      if (legacyKey && !legacyId) {
        const keyBytes = fromBase64(legacyKey);
        const derivedId = idFromKey(keyBytes);
        const toStore = JSON.stringify({ k: legacyKey, id: derivedId });
        await SecureStore.setItemAsync(KEY_V2_NAME, toStore, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        await SecureStore.setItemAsync(LEGACY_ID_NAME, derivedId, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        cached = { keyB64: legacyKey, id: derivedId };
        return cached;
      }

      if (!legacyKey && legacyId) {
        // Id exists but key missing – backup restore case
        const created = Crypto.getRandomBytes(32);
        const newId = idFromKey(created);
        const toStore = JSON.stringify({ k: toBase64(created), id: newId });
        await SecureStore.setItemAsync(KEY_V2_NAME, toStore, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        cached = { keyB64: toBase64(created), id: newId };
        return cached;
      }

      // 3. No keys – first launch
      const created = Crypto.getRandomBytes(32);
      const newId = idFromKey(created);
      const toStore = JSON.stringify({ k: toBase64(created), id: newId });
      await SecureStore.setItemAsync(KEY_V2_NAME, toStore, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await SecureStore.setItemAsync(LEGACY_KEY_NAME, toBase64(created), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await SecureStore.setItemAsync(LEGACY_ID_NAME, newId, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      cached = { keyB64: toBase64(created), id: newId };
      return cached;
    })();

    try {
      const result = await pending;
      return result;
    } finally {
      pending = null;
    }
  }

  return {
    async keyId() {
      const { id } = await ensure();
      return id;
    },
    async rootKey() {
      const { keyB64 } = await ensure();
      return fromBase64(keyB64);
    },
  };
}

/** Injected into the store: nonces come from the OS RNG, never Math.random. */
export const osRandom = (length: number): Uint8Array => Crypto.getRandomBytes(length);
