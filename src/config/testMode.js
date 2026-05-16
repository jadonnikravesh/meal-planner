// ─── Build environment ────────────────────────────────────────────────────────
//
// EXPO_PUBLIC_APP_ENV is injected at build time by eas.json:
//   preview    → TestFlight (internal distribution)
//   production → App Store
//   undefined  → Metro bundler (local development)
//
// DEV_MODE   — true only inside the Metro bundler (__DEV__).
//
// TEST_MODE  — enables the fake Apple-reviewer account in AuthContext.
//              Keep true in every build — only activates for TEST_EMAIL.
//
// isReviewAccount(user) — true for the Apple reviewer test account.
//              Used for: IAP bypass, onboarding reset. Not for dev UI.
//
// isDevEnabled(user) — single gate for ALL developer-only UI:
//   Metro dev    → always enabled
//   TestFlight   → enabled only for allowlisted developer emails
//   App Store    → always disabled, for everyone without exception

const _APP_ENV      = process.env.EXPO_PUBLIC_APP_ENV;  // injected by eas.json
const _IS_TESTFLIGHT = _APP_ENV === 'preview';
const _IS_PRODUCTION = _APP_ENV === 'production';

// Emails that receive developer access in TestFlight. Nobody gets it in production.
const _DEV_ALLOWLIST = new Set([
  'jadonnikwork@gmail.com',
  'jadonnikravesh@gmail.com',
]);

export const DEV_MODE = __DEV__;

export const TEST_MODE     = true;
export const TEST_EMAIL    = 'test@shredai.com';
export const TEST_PASSWORD = 'test1234';

// Returns true when `user` is the designated Apple review/test account.
// Safe to call with null/undefined.
export function isReviewAccount(user) {
  return !!(user?.isTestAccount || user?.email === TEST_EMAIL);
}

// Returns true when developer-only UI should be visible for this user.
// This is the only gate that should be used for dev UI throughout the app.
export function isDevEnabled(user) {
  if (__DEV__) return true;                    // Metro bundler: always on
  if (_IS_PRODUCTION) return false;            // App Store: always off
  // TestFlight (preview) or unset env: allowlist check
  return _IS_TESTFLIGHT && _DEV_ALLOWLIST.has((user?.email ?? '').toLowerCase());
}
