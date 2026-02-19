import { create } from "zustand";
import type { User } from "./api";

/**
 * Auth state is stored in memory only.
 * The actual JWT lives in an httpOnly cookie set by the backend — it is
 * never accessible from JavaScript, protecting against XSS token theft.
 *
 * On page load we rely on /users/me (called from dashboard) to rehydrate
 * the user object. The cookie is sent automatically with every request.
 */
interface AuthState {
  user: User | null;
  setUser: (user: User) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,

  setUser: (user: User) => {
    set({ user });
  },

  clearAuth: () => {
    set({ user: null });
  },

  isAuthenticated: () => !!get().user,
}));
