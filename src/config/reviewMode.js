// ─── Review / App Store testing mode ─────────────────────────────────────────
//
// Set to true before submitting a build for App Store review.
// Set to false (or delete this file + all imports) before shipping to users.
//
// Effects when true:
//   • Subscription state is always treated as inactive → paywall always shows
//   • "Unlock for Testing" button appears on the paywall to simulate a purchase
//   • Apple IAP code is still wired up and functional — it just isn't required

export const REVIEW_MODE = false;
