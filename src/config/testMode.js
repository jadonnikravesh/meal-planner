// ─── Test / Review Mode ───────────────────────────────────────────────────────
//
// DEV_MODE   — true inside the Metro bundler, false in ALL production builds
//              (TestFlight + App Store). Provided by React Native as __DEV__.
//
// TEST_MODE  — compile-time flag that enables the fake test account in AuthContext
//              so Apple reviewers can log in without Firebase. Keep true in every
//              build — it only activates for the specific test email below.
//
// isReviewAccount(user) — returns true when the signed-in user is the test account.
//              Use this (plus DEV_MODE) to gate any developer-only UI so real users
//              never see it, but Apple reviewers always can.
//
// Gating pattern:
//   DEV_MODE || isReviewAccount(user)   →  Developer UI visible
//   isReviewAccount(user)               →  IAP bypass, onboarding reset

export const DEV_MODE = __DEV__;

export const TEST_MODE     = true;   // keep true — activates fake auth for test account only
export const TEST_EMAIL    = 'test@foodchatai.com';
export const TEST_PASSWORD = 'test1234';

// Returns true when `user` is the designated review/test account.
// Safe to call with null/undefined — returns false.
export function isReviewAccount(user) {
  return !!(user?.isTestAccount || user?.email === TEST_EMAIL);
}
