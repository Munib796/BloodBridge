import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import type { Donor, Requestor, Role } from "@/api/types";

const TOKEN_KEY = "bloodbridge.token";
const ROLE_KEY = "bloodbridge.role";

type SelfEntity = Donor | Requestor;

interface AuthState {
  token: string | null;
  role: Role | null;
  self: SelfEntity | null;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  signIn: (token: string, role: Role) => Promise<void>;
  setSelf: (self: SelfEntity) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  role: null,
  self: null,
  isHydrated: false,

  // Called once, high up in the component tree, before we decide which
  // screen to show. SecureStore reads are async, so until this resolves we
  // don't yet know whether the user is logged in.
  hydrate: async () => {
    const [token, role] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(ROLE_KEY),
    ]);
    set({
      token: token ?? null,
      role: (role as Role | null) ?? null,
      isHydrated: true,
    });
  },

  signIn: async (token, role) => {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(ROLE_KEY, role),
    ]);
    set({ token, role });
  },

  setSelf: (self) => set({ self }),

  signOut: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(ROLE_KEY),
    ]);
    set({ token: null, role: null, self: null });
  },
}));
