/**
 * Persisted session storage.
 *
 * The JWT is the app's only credential, so it goes in the OS keychain via
 * expo-secure-store — never AsyncStorage, which is a plain unencrypted
 * database that any app with filesystem access can read.
 *
 * Layering: this module is deliberately dumb. It stores strings and an opaque
 * identity blob, and knows nothing about roles or the API. AuthContext owns
 * the meaning; nothing here imports from it.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "bloodbridge.token";
const IDENTITY_KEY = "bloodbridge.identity";

/**
 * SecureStore is native-only, and the app also builds for web (react-native-web
 * is a dependency). Calling SecureStore there throws, which would take down the
 * whole provider, so web falls back to localStorage.
 *
 * That fallback is NOT secure — a browser has no equivalent of the keychain,
 * and anything readable by the page is readable by injected script. It exists
 * so web stays usable for layout work; tokens on web are a known gap, not a
 * solved problem.
 */
const isWeb = Platform.OS === "web";

function webStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Access itself throws in some privacy modes rather than returning null.
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return webStorage()?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// --- JWT -------------------------------------------------------------------

export async function saveToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await removeItem(TOKEN_KEY);
}

// --- Cached identity -------------------------------------------------------
/**
 * The profile is cached alongside the token so a cold start can render the
 * logged-in UI immediately instead of showing a spinner while it calls
 * /me. It is a cache, not the source of truth: AuthContext re-fetches the
 * profile on boot and overwrites this.
 */

export async function saveIdentity<T>(identity: T): Promise<void> {
  const serialised = JSON.stringify(identity);

  // Android's keychain rejects large values (the documented ceiling is 2048
  // bytes). A profile sits far below that, but a failure here must not break
  // login — an uncached identity just means one extra /me call on next boot.
  if (serialised.length > 2000) {
    console.warn(
      "[tokenStorage] Identity too large to cache; it will be re-fetched on next launch.",
    );
    return;
  }

  await setItem(IDENTITY_KEY, serialised);
}

export async function getIdentity<T>(): Promise<T | null> {
  const raw = await getItem(IDENTITY_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Written by an older build, or corrupted. Drop it rather than crashing
    // on every launch from here on.
    await removeItem(IDENTITY_KEY);
    return null;
  }
}

export async function clearIdentity(): Promise<void> {
  await removeItem(IDENTITY_KEY);
}

// --- Both ------------------------------------------------------------------

/**
 * Wipe everything. Used on logout, and on a 401 — a token the backend has
 * rejected must not be left behind to fail again on the next launch.
 */
export async function clearSession(): Promise<void> {
  await Promise.all([clearToken(), clearIdentity()]);
}
