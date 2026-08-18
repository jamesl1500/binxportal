import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LoginPreferencesState {
  rememberedEmail: string;
  setRememberedEmail: (email: string | null) => void;
}

/** Persists the "remember me" email across sessions so the login form can prefill it. */
export const useLoginPreferencesStore = create<LoginPreferencesState>()(
  persist(
    (set) => ({
      rememberedEmail: "",
      setRememberedEmail: (email) => set({ rememberedEmail: email ?? "" }),
    }),
    { name: "binx-login-preferences" },
  ),
);
