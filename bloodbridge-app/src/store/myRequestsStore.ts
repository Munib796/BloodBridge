import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const KEY = "bloodbridge.myRequestIds";

interface MyRequestsState {
  ids: string[];
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  addId: (id: string) => Promise<void>;
}

// WORKAROUND: the backend currently has no "GET /blood-requests/mine"
// endpoint — only "get by id" and "nearby for donor". Until that's added
// server-side, we remember which request IDs this requestor created, on
// this device, and fetch each one's live status individually. This means
// requests won't show up if the user reinstalls the app or logs in on a
// new device — worth a small backend addition later (see chat notes).
export const useMyRequestsStore = create<MyRequestsState>((set, get) => ({
  ids: [],
  isHydrated: false,

  hydrate: async () => {
    const raw = await SecureStore.getItemAsync(KEY);
    set({ ids: raw ? JSON.parse(raw) : [], isHydrated: true });
  },

  addId: async (id) => {
    const next = [id, ...get().ids.filter((existing) => existing !== id)];
    set({ ids: next });
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  },
}));
