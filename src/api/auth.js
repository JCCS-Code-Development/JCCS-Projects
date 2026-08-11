import client from './client'

// Resolves a FieldClock-issued JWT to this user's Projects-specific role.
// Returns 403 if the user hasn't been provisioned for Projects yet.
export const verify = () => client.get('/auth/verify.php').then((r) => r.data)
