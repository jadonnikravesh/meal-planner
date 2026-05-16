// Returns fetch headers with a Firebase ID token attached.
// Falls back to content-type only for test accounts (no real Firebase token).
export async function getAuthHeaders(user) {
  const base = { 'Content-Type': 'application/json' };

  if (!user || user.isTestAccount || typeof user.getIdToken !== 'function') {
    return base;
  }

  try {
    const token = await user.getIdToken();
    return { ...base, Authorization: `Bearer ${token}` };
  } catch (err) {
    console.warn('[auth] getIdToken failed:', err.message);
    return base;
  }
}
