import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Staff (Admin / PM-Lead) session. No local login of its own — user/token
// pair comes from FieldClock's login, then this app's own /auth/verify.php
// resolves the FieldClock-issued JWT to a Projects-specific role.
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,          // { id, name, role: 'admin' | 'pm' }
      token: null,          // FieldClock-issued JWT, validated locally by the Projects API
      refreshToken: null,   // FieldClock refresh token
      isAuthenticated: false,

      login: (user, token, refreshToken) =>
        set({ user, token, refreshToken, isAuthenticated: true }),

      logout: () =>
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false }),

      updateToken: (token, refreshToken) =>
        set(refreshToken ? { token, refreshToken } : { token }),
    }),
    { name: 'projects-auth' }
  )
)
