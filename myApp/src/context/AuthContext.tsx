/**
 * Who is signed in, for the whole app.
 *
 * Holds the session (token + role + profile), keeps the API client's token in
 * step with it, and persists it via tokenStorage so a restart lands the user
 * back where they were. Screens read this through useAuth(); nothing else
 * should be reading the token out of storage directly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api, setAuthToken, setUnauthorizedHandler } from "../lib/apiClient";
import type {
  AuthProfile,
  DonorProfile,
  FacilityProfile,
  RequestorProfile,
} from "../lib/apiTypes";
import {
  clearSession,
  getIdentity,
  getToken,
  saveIdentity,
  saveToken,
} from "../lib/tokenStorage";
import { registerPushToken } from "../lib/notifications";

// The profile DTOs moved to src/lib/apiTypes.ts once the donor home feed needed
// the same shapes; they are re-exported here so existing imports keep working.
export type { AuthProfile, DonorProfile, FacilityProfile, RequestorProfile };

// --- Roles and profiles ----------------------------------------------------
/**
 * The four roles that can log in. `admin` is deliberately absent: it signs in
 * through a separate hardcoded-admin endpoint and is not a mobile-app user.
 */
export type UserRole = "donor" | "requestor" | "hospital" | "organization";

/** Backend path segment per role — note they are plural in the URL. */
const ROLE_PATHS: Record<UserRole, string> = {
  donor: "donors",
  requestor: "requestors",
  hospital: "hospitals",
  organization: "organizations",
};

// These mirror the backend's *Out DTOs — see src/lib/apiTypes.ts. The role and
// session unions below are app concepts rather than API shapes, so they stay
// here.

/**
 * Role and profile travel together and are always consistent, so they are one
 * union. That lets a screen narrow on `role` and have the matching profile
 * fields typed without a cast.
 */
export type AuthSession =
  | { role: "donor"; profile: DonorProfile }
  | { role: "requestor"; profile: RequestorProfile }
  | { role: "hospital"; profile: FacilityProfile }
  | { role: "organization"; profile: FacilityProfile };

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | ({ status: "signedIn"; token: string } & AuthSession);

type TokenResponse = { access_token: string; token_type: string };

// --- Session helpers -------------------------------------------------------

/**
 * Pair a role with the profile fetched for it.
 *
 * The pairing is guaranteed by construction — `fetchProfile` asks
 * /donors/me only when told the role is "donor" — but TypeScript can't follow
 * a dynamic role through to the matching union member, so the assertion is
 * made once, here, instead of at every call site.
 */
function toSession(role: UserRole, profile: AuthProfile): AuthSession {
  return { role, profile } as AuthSession;
}

async function fetchProfile(role: UserRole): Promise<AuthProfile> {
  return api.get<AuthProfile>(`/${ROLE_PATHS[role]}/me`);
}

async function persist(token: string, session: AuthSession): Promise<void> {
  try {
    await Promise.all([saveToken(token), saveIdentity(session)]);
  } catch (error) {
    // Storage failing must not fail the login — the session still works for
    // as long as the app is open, it just won't survive a restart.
    console.warn("[Auth] Could not persist the session.", error);
  }
}

// --- Context ---------------------------------------------------------------

type AuthContextValue = {
  state: AuthState;
  /** Adopt an already-obtained token + profile. The primitive the others use. */
  login: (role: UserRole, token: string, profile: AuthProfile) => Promise<void>;
  /** Log in against the backend: POST /{role}/login, then GET /{role}/me. */
  signIn: (role: UserRole, email: string, password: string) => Promise<void>;
  /** Clear the session. Navigation is the caller's job, not this hook's. */
  logout: () => Promise<void>;
  /** Re-read the profile from the backend, e.g. after editing it. */
  refreshProfile: () => Promise<void>;
  /** Adopt a profile the backend just returned from a write. */
  applyProfile: (profile: AuthProfile) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  // Mirrors `state` so the async callbacks below can read the current session
  // without an effect dependency or a side effect inside a state updater —
  // React is free to invoke an updater more than once, which would double-fire
  // the request that refreshProfile makes.
  const stateRef = useRef<AuthState>({ status: "loading" });

  const applyState = useCallback((next: AuthState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const adopt = useCallback(
    async (token: string, session: AuthSession) => {
      // Before setState, so no consumer can render a signed-in screen and fire
      // a request in the gap where the token isn't attached yet.
      setAuthToken(token);
      applyState({ status: "signedIn", token, ...session });
    },
    [applyState],
  );

  const logout = useCallback(async () => {
    setAuthToken(null);
    applyState({ status: "signedOut" });
    await clearSession();
  }, [applyState]);

  const refreshProfile = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== "signedIn") return;

    try {
      const profile = await fetchProfile(current.role);
      const session = toSession(current.role, profile);
      await saveIdentity(session);
      await adopt(current.token, session);
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        await logout();
        return;
      }
      // Anything else (offline, 5xx) leaves the cached profile in place — a
      // stale name beats blanking the screen.
      console.warn("[Auth] Could not refresh the profile.");
    }
  }, [adopt, logout]);

  // A 401 on any later request means the token is dead — expired, or
  // invalidated by a password reset, which revokes every token issued before
  // it. Without this the app would keep rendering a signed-in UI that 401s on
  // every call.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Hydrate from storage once, on mount.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let token: string | null = null;
      let session: AuthSession | null = null;

      try {
        token = await getToken();
        session = token ? await getIdentity<AuthSession>() : null;
      } catch (error) {
        // A keychain that won't open must not strand the app on a blank
        // screen — fall through to signedOut and let the user log in again.
        console.warn("[Auth] Could not read the stored session.", error);
      }

      if (cancelled) return;

      if (!token || !session) {
        setAuthToken(null);
        applyState({ status: "signedOut" });
        return;
      }

      await adopt(token, session);
      if (cancelled) return;

      // Then revalidate against the backend, so the cached profile can't go
      // permanently stale. The app is already usable at this point, so this
      // never blocks the first render.
      try {
        const profile = await fetchProfile(session.role);
        if (cancelled) return;
        const refreshed = toSession(session.role, profile);
        await saveIdentity(refreshed);
        if (cancelled) return;
        await adopt(token, refreshed);
      } catch (error) {
        if (error instanceof ApiError && error.isUnauthorized) {
          if (!cancelled) await logout();
          return;
        }
        // Offline or the backend is down: keep the cached session. The token
        // may well still be good, and logging the user out on a flaky
        // connection is worse than showing slightly stale data.
        console.warn("[Auth] Could not refresh the profile; using the cached copy.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adopt, applyState, logout]);

  const login = useCallback(
    async (role: UserRole, token: string, profile: AuthProfile) => {
      const session = toSession(role, profile);
      await persist(token, session);
      await adopt(token, session);
    },
    [adopt],
  );

  // For endpoints that already return the updated profile — PATCH
  // /donors/me/availability, for one. Cheaper and more accurate than calling
  // refreshProfile() afterwards, which would ask the backend to repeat what it
  // just told us, and could land out of order if the screen toggles twice.
  const applyProfile = useCallback(
    (profile: AuthProfile) => {
      const current = stateRef.current;
      if (current.status !== "signedIn") return;
      const session = toSession(current.role, profile);
      // Persisted, so a restart doesn't resurrect the pre-edit profile.
      void saveIdentity(session);
      applyState({ status: "signedIn", token: current.token, ...session });
    },
    [applyState],
  );

  const signIn = useCallback(
    async (role: UserRole, email: string, password: string) => {
      const { access_token } = await api.post<TokenResponse>(
        `/${ROLE_PATHS[role]}/login`,
        { email, password },
        { auth: false },
      );

      // The login endpoint returns only a token, so the profile is a second
      // call. It has to happen with the token already attached, which means
      // setting it before the request rather than inside adopt().
      setAuthToken(access_token);
      try {
        const profile = await fetchProfile(role);
        const session = toSession(role, profile);
        await persist(access_token, session);
        await adopt(access_token, session);
        void registerPushToken(role);
      } catch (error) {
        // Otherwise a half-finished login leaves a token attached to a
        // signed-out client, and the next request goes out authenticated.
        setAuthToken(null);
        throw error;
      }
    },
    [adopt],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, signIn, logout, refreshProfile, applyProfile }),
    [state, login, signIn, logout, refreshProfile, applyProfile],
  );

  // Children are withheld only while the single keychain read is in flight.
  // That read is fast and offline-safe, so nothing flashes; the network
  // revalidation above happens after and never blocks the first render.
  if (state.status === "loading") {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
