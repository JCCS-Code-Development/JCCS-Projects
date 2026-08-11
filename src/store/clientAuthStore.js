import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Client-portal session — entirely separate from staff auth (own JWT, own
// localStorage key) so a staff member and a client can never collide in the
// same browser, and a client token can never be mistaken for a staff one.
export const useClientAuthStore = create(
  persist(
    (set) => ({
      client: null,        // { id, name, email }
      token: null,          // Projects-issued client JWT (CLIENT_JWT_SECRET)
      refreshToken: null,
      isAuthenticated: false,

      login: (client, token, refreshToken) =>
        set({ client, token, refreshToken, isAuthenticated: true }),

      logout: () =>
        set({ client: null, token: null, refreshToken: null, isAuthenticated: false }),

      updateToken: (token, refreshToken) =>
        set(refreshToken ? { token, refreshToken } : { token }),
    }),
    { name: 'projects-client-auth' }
  )
)
